# usage: python3 -I ext-load-library.py <libsqlite3 path> <vec0 path>
# Calls the library's C API through ctypes: the system Python here has no enable_load_extension.
import ctypes
import json
import sys

lib = ctypes.CDLL(sys.argv[1])
lib.sqlite3_libversion.restype = ctypes.c_char_p
lib.sqlite3_errmsg.restype = ctypes.c_char_p
db = ctypes.c_void_p()
lib.sqlite3_open(b":memory:", ctypes.byref(db))
out = {"library": sys.argv[1], "sqlite": lib.sqlite3_libversion().decode()}
err = ctypes.c_char_p()
out["enable_load_extension_rc"] = lib.sqlite3_enable_load_extension(db, 1)
rc = lib.sqlite3_load_extension(db, sys.argv[2].encode(), None, ctypes.byref(err))
out["load_extension_rc"] = rc
if rc != 0:
    out["error"] = err.value.decode() if err.value else lib.sqlite3_errmsg(db).decode()
else:
    rows = []
    CALLBACK = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_int,
                                ctypes.POINTER(ctypes.c_char_p), ctypes.POINTER(ctypes.c_char_p))
    collect = CALLBACK(lambda _, n, values, __: rows.append([values[i].decode() for i in range(n)]) or 0)
    sql = (b"create virtual table t using vec0(kind text partition key, e float[4]);"
           b"insert into t(rowid, kind, e) values (1, 'message', '[1,0,0,0]'), (2, 'image', '[1,0,0,0]');"
           b"select vec_version(), rowid from t where e match '[1,0,0,0]' and k = 5 and kind = 'image';")
    out["exec_rc"] = lib.sqlite3_exec(db, sql, collect, None, ctypes.byref(err))
    out["rows"] = rows
print(json.dumps(out))
