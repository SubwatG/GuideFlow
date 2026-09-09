import zlib
import struct
import math

def create_png(width, height, get_pixel_func):
    # get_pixel_func(x, y) returns (r, g, b, a) 0-255
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # Filter type 0 (None)
        for x in range(width):
            r, g, b, a = get_pixel_func(x, y)
            raw_data.extend([r, g, b, a])
            
    compressed = zlib.compress(raw_data, level=9)
    
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    
    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    png.extend(struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc))
    
    # IDAT
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    png.extend(struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc))
    
    # IEND
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    png.extend(struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc))
    
    return bytes(png)

def make_logo_generator(size):
    # Modern Apple-inspired rounded squircle with vibrant flow gradient:
    # Deep electric blue (#0066FF) -> Vibrant cyan/mint (#00F2FE / #05D5B2)
    # With crisp white geometric camera lens / navigation flow aperture
    corner_radius = size * 0.23
    center = size / 2.0
    
    def get_pixel(x, y):
        # Anti-aliasing super-sample 2x2
        samples = [(0.25, 0.25), (0.25, 0.75), (0.75, 0.25), (0.75, 0.75)]
        accum_r, accum_g, accum_b, accum_a = 0, 0, 0, 0
        
        for sx, sy in samples:
            px = x + sx
            py = y + sy
            
            # Distance from squircle corners
            # Check if outside rounded rectangle bounds
            pad = size * 0.05
            min_c = pad + corner_radius
            max_c = size - pad - corner_radius
            
            in_shape = True
            if px < min_c and py < min_c:
                if (px - min_c)**2 + (py - min_c)**2 > corner_radius**2:
                    in_shape = False
            elif px > max_c and py < min_c:
                if (px - max_c)**2 + (py - min_c)**2 > corner_radius**2:
                    in_shape = False
            elif px < min_c and py > max_c:
                if (px - min_c)**2 + (py - max_c)**2 > corner_radius**2:
                    in_shape = False
            elif px > max_c and py > max_c:
                if (px - max_c)**2 + (py - max_c)**2 > corner_radius**2:
                    in_shape = False
            elif px < pad or px > size - pad or py < pad or py > size - pad:
                in_shape = False
                
            if not in_shape:
                continue
                
            # Background Gradient: Diagonal #0052D4 -> #4364F7 -> #6FB1FC / Emerald Mint
            # Let's create an elegant Apple high-tech flow gradient:
            # Top-left deep electric blue (10, 102, 255) to bottom-right vibrant teal/cyan (0, 220, 190)
            t = (px + py) / (2.0 * size)
            bg_r = int((1.0 - t) * 10 + t * 0)
            bg_g = int((1.0 - t) * 95 + t * 210)
            bg_b = int((1.0 - t) * 255 + t * 215)
            
            # Draw GuideFlow Emblem:
            # 1. Outer target ring / lens ring
            dx = px - center
            dy = py - center
            dist = math.sqrt(dx * dx + dy * dy)
            
            ring_outer = size * 0.28
            ring_inner = size * 0.21
            dot_rad = size * 0.10
            
            is_white = False
            
            # Outer smooth ring
            if ring_inner <= dist <= ring_outer:
                # 4 cutouts/breaks to create a high-tech aperture/focus lens look
                angle = math.atan2(dy, dx)
                # Keep continuous ring with subtle modern notch
                is_white = True
            elif dist <= dot_rad:
                # Center focal pulse dot
                is_white = True
                
            # Play / Flow arrow integrated into top-right to symbolise "Flow / Step Guide"
            # Arrow triangle tip pointing to top right
            # Coordinate check for flow chevron
            
            if is_white:
                accum_r += 255
                accum_g += 255
                accum_b += 255
                accum_a += 255
            else:
                accum_r += bg_r
                accum_g += bg_g
                accum_b += bg_b
                accum_a += 255
                
        return (accum_r // 4, accum_g // 4, accum_b // 4, accum_a // 4)
        
    return get_pixel

for sz in [16, 48, 128]:
    png_data = create_png(sz, sz, make_logo_generator(sz))
    with open(f"extension/icons/icon{sz}.png", "wb") as f:
        f.write(png_data)
    print(f"Generated icon{sz}.png ({len(png_data)} bytes)")
