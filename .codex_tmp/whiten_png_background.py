#!/usr/bin/env python3
import struct
import sys
import zlib
from collections import deque


PNG_SIG = b"\x89PNG\r\n\x1a\n"


def paeth(a, b, c):
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png(path):
    data = open(path, "rb").read()
    if not data.startswith(PNG_SIG):
        raise ValueError("not a PNG")
    pos = len(PNG_SIG)
    width = height = color_type = bit_depth = None
    idat = []
    chunks = []
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        ctype = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        chunks.append((ctype, chunk))
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, bit_depth, color_type, compression, flt, interlace = struct.unpack(
                ">IIBBBBB", chunk
            )
            if bit_depth != 8 or color_type != 2 or interlace != 0:
                raise ValueError("expected non-interlaced 8-bit RGB PNG")
        elif ctype == b"IDAT":
            idat.append(chunk)
    raw = zlib.decompress(b"".join(idat))
    bpp = 3
    stride = width * bpp
    rows = []
    src = 0
    prev = bytearray(stride)
    for _ in range(height):
        ftype = raw[src]
        src += 1
        row = bytearray(raw[src : src + stride])
        src += stride
        for i in range(stride):
            left = row[i - bpp] if i >= bpp else 0
            up = prev[i]
            up_left = prev[i - bpp] if i >= bpp else 0
            if ftype == 1:
                row[i] = (row[i] + left) & 255
            elif ftype == 2:
                row[i] = (row[i] + up) & 255
            elif ftype == 3:
                row[i] = (row[i] + ((left + up) >> 1)) & 255
            elif ftype == 4:
                row[i] = (row[i] + paeth(left, up, up_left)) & 255
            elif ftype != 0:
                raise ValueError("unsupported PNG filter")
        rows.append(row)
        prev = row
    return width, height, rows, chunks


def is_background_pixel(r, g, b):
    mn = min(r, g, b)
    mx = max(r, g, b)
    avg = (r + g + b) / 3
    return (mn >= 236 and mx - mn <= 10) or avg >= 252


def write_png(path, width, height, rows, chunks):
    raw = bytearray()
    for row in rows:
        raw.append(0)
        raw.extend(row)
    compressed = zlib.compress(bytes(raw), 9)
    out = bytearray(PNG_SIG)

    def chunk(ctype, payload):
        out.extend(struct.pack(">I", len(payload)))
        out.extend(ctype)
        out.extend(payload)
        out.extend(struct.pack(">I", zlib.crc32(ctype + payload) & 0xFFFFFFFF))

    for ctype, payload in chunks:
        if ctype == b"IDAT":
            continue
        if ctype == b"IEND":
            chunk(b"IDAT", compressed)
            chunk(b"IEND", b"")
            break
        chunk(ctype, payload)
    open(path, "wb").write(out)


def main():
    src, dst = sys.argv[1:3]
    width, height, rows, chunks = read_png(src)
    seen = bytearray(width * height)
    queue = deque()

    def add(x, y):
        idx = y * width + x
        if seen[idx]:
            return
        p = x * 3
        if is_background_pixel(rows[y][p], rows[y][p + 1], rows[y][p + 2]):
            seen[idx] = 1
            queue.append((x, y))

    for x in range(width):
        add(x, 0)
        add(x, height - 1)
    for y in range(height):
        add(0, y)
        add(width - 1, y)

    while queue:
        x, y = queue.popleft()
        p = x * 3
        rows[y][p : p + 3] = b"\xff\xff\xff"
        if x:
            add(x - 1, y)
        if x + 1 < width:
            add(x + 1, y)
        if y:
            add(x, y - 1)
        if y + 1 < height:
            add(x, y + 1)

    write_png(dst, width, height, rows, chunks)


if __name__ == "__main__":
    main()
