# usage: python3 -I evict.py <file>...   drops the files' pages from the OS page cache, no root needed
import os
import sys

for path in sys.argv[1:]:
    if os.path.exists(path):
        fd = os.open(path, os.O_RDONLY)
        os.fsync(fd)
        os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
        os.close(fd)
