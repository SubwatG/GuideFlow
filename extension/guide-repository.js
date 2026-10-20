// One durable draft. Images and their references commit in the same transaction.
(function (root) {
  function createIndexedBackend(indexedDB) {
    let opening;
    function database() {
      if (!opening) opening = new Promise((resolve, reject) => {
        const request = indexedDB.open("guideflow", 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("drafts");
          request.result.createObjectStore("images");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { opening = null; reject(request.error); };
        request.onblocked = () => { opening = null; reject(new Error("Guide database is busy; close older GuideFlow tabs")); };
      });
      return opening;
    }
    async function get(store, key) {
      const db = await database();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const request = tx.objectStore(store).get(key);
        tx.oncomplete = () => resolve(request.result || null);
        tx.onabort = tx.onerror = () => reject(tx.error || new Error("Guide database read failed"));
      });
    }
    return {
      read: () => get("drafts", "current"),
      image: id => get("images", id),
      async commit(record, images, removed) {
        const db = await database();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(["drafts", "images"], "readwrite");
          tx.objectStore("drafts").put(record, "current");
          const store = tx.objectStore("images");
          for (const [id, blob] of images) store.put(blob, id);
          for (const id of removed) store.delete(id);
          tx.oncomplete = resolve;
          tx.onabort = tx.onerror = () => reject(tx.error || new Error("Guide database write failed"));
        });
      }
    };
  }

  function imageToBlob(value) {
    const [header, base64] = value.split(",");
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    return new Blob([bytes], { type: header.slice(5, header.indexOf(";")) });
  }
  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      if (!blob) { reject(new Error("A saved screenshot is missing")); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Unable to read screenshot"));
      reader.readAsDataURL(blob);
    });
  }

  class GuideRepository {
    constructor(options) {
      this.backend = options.backend || createIndexedBackend(options.indexedDB || root.indexedDB);
      this.storage = options.storage;
      this.runtime = options.runtime;
      this.crypto = options.crypto || root.crypto;
      this.validateBundle = options.validateBundle;
      this.imageToBlob = options.imageToBlob || imageToBlob;
      this.blobToImage = options.blobToImage || blobToImage;
      this.queue = Promise.resolve();
    }
    serial(operation) {
      const job = this.queue.then(operation);
      this.queue = job.catch(() => {});
      return job;
    }
    local(method, value) {
      return new Promise((resolve, reject) => this.storage[method](value, result => {
        const error = this.runtime?.lastError;
        if (error) reject(new Error(error.message)); else resolve(result);
      }));
    }
    id() { return this.crypto.randomUUID(); }
    async ensure() {
      const existing = await this.backend.read();
      if (existing) return existing;
      const legacy = await this.local("get", ["currentSession", "sessionMeta"]);
      const bundle = this.validateBundle({ meta: legacy.sessionMeta || { title: "คู่มือการใช้งานระบบ" }, session: legacy.currentSession || [] });
      const record = await this.persist(bundle, null, this.id());
      // Existing local data stays recoverable until the durable transaction commits.
      if (legacy.currentSession) await this.local("remove", ["currentSession"]).catch(() => {});
      return record;
    }
    async hydrate(record) {
      const cache = new Map();
      const image = async id => {
        if (!cache.has(id)) cache.set(id, this.backend.image(id).then(blob => this.blobToImage(blob)));
        return cache.get(id);
      };
      const session = [];
      for (const stored of record.bundle.session) {
        const { imageIds, primaryImageId, ...step } = stored;
        step.screenshot = await image(primaryImageId);
        step.screenshots = await Promise.all(imageIds.map(image));
        session.push(step);
      }
      return { bundle: { schemaVersion: 1, meta: record.bundle.meta, session }, revision: record.revision, recordingId: record.recordingId };
    }
    async notify(record) {
      try {
        await this.local("set", { guideRevision: record.revision, guideStepCount: record.bundle.session.length, sessionMeta: record.bundle.meta, recordingId: record.recordingId });
      } catch (_) {
        // Durable commit succeeded. A GET_GUIDE retries the lightweight notification.
        // Reporting a write failure here would encourage duplicate appends.
      }
    }
    async persist(bundle, previous, recordingId) {
      const images = new Map();
      const oldIds = new Set(previous?.imageIds || []);
      const imageIds = new Set();
      const idsByValue = new Map();
      const encode = async value => {
        if (idsByValue.has(value)) return idsByValue.get(value);
        const digest = await this.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
        const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        idsByValue.set(value, id);
        imageIds.add(id);
        if (!oldIds.has(id)) images.set(id, await this.imageToBlob(value));
        return id;
      };
      const session = [];
      for (const item of bundle.session) {
        const { screenshot, screenshots, ...step } = item;
        step.id ||= this.id();
        step.primaryImageId = await encode(screenshot);
        step.imageIds = await Promise.all((screenshots?.length ? screenshots : [screenshot]).map(encode));
        session.push(step);
      }
      const record = { revision: (previous?.revision || 0) + 1, recordingId, bundle: { schemaVersion: 1, meta: bundle.meta, session }, imageIds: [...imageIds] };
      await this.backend.commit(record, images, [...oldIds].filter(id => !imageIds.has(id)));
      await this.notify(record);
      return record;
    }
    read() {
      return this.serial(async () => { const record = await this.ensure(); await this.notify(record); return this.hydrate(record); });
    }
    check(record, options, revisionRequired = false) {
      if (!options.recordingId || options.recordingId !== record.recordingId) throw new Error("Recording changed; reload the guide before saving");
      if ((revisionRequired || options.expectedRevision !== undefined) && options.expectedRevision !== record.revision) throw new Error("Guide changed (revision conflict); reload before saving");
    }
    replace(bundle, options = {}) {
      return this.serial(async () => {
        const record = await this.ensure(); this.check(record, options, true);
        return this.hydrate(await this.persist(this.validateBundle(bundle), record, options.newRecording ? this.id() : record.recordingId));
      });
    }
    append(step, options = {}) {
      return this.serial(async () => {
        const record = await this.ensure(); this.check(record, options);
        const snapshot = await this.hydrate(record);
        if (step.id && snapshot.bundle.session.some(item => item.id === step.id)) return snapshot;
        snapshot.bundle.session.push(step);
        const valid = this.validateBundle(snapshot.bundle);
        return this.hydrate(await this.persist(valid, record, record.recordingId));
      });
    }
    start(options) {
      return this.serial(async () => {
        const record = await this.ensure();
        const old = options.append ? (await this.hydrate(record)).bundle : { meta: {}, session: [] };
        const bundle = this.validateBundle({ meta: { ...old.meta, title: options.title || old.meta.title || "คู่มือการใช้งานระบบ", startTime: Date.now(), captureMode: options.captureMode === "fullpage" ? "fullpage" : "viewport" }, session: old.session });
        return this.hydrate(await this.persist(bundle, record, this.id()));
      });
    }
  }
  root.GuideRepository = GuideRepository;
  if (typeof module !== "undefined") module.exports = { GuideRepository, createIndexedBackend };
})(typeof globalThis !== "undefined" ? globalThis : this);
