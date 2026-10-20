"""GLB -> self-contained glTF JSON (binary chunk embedded as a base64 data URI)."""
import base64, json, struct, sys
b = open(sys.argv[1], 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + n]); off = 20 + n; bl = struct.unpack('<I', b[off:off + 4])[0]; binc = b[off + 8: off + 8 + bl]
j['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(binc).decode()
open(sys.argv[2], 'w').write(json.dumps(j, separators=(',', ':')))
