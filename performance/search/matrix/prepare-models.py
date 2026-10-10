"""Explicitly prepare only two small, revision-pinned ranking models."""
import argparse
import hashlib
import json
from pathlib import Path
import time
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('cache', type=Path)
args = parser.parse_args()
models = [('tinybert', 'cross-encoder/ms-marco-TinyBERT-L2-v2', '81d1926f67cb8eee2c2be17ca9f793c7c3bd20cc'),
          ('minilm-l6', 'cross-encoder/ms-marco-MiniLM-L6-v2', '233902d25c440f23af6f7d6e94d2946bac0bee0a')]
selected = ['onnx/model_quint8_avx2.onnx', 'tokenizer.json', 'tokenizer_config.json', 'config.json', 'special_tokens_map.json']
for key, repo, revision in models:
    root = args.cache / key
    root.mkdir(parents=True, exist_ok=True)
    manifest_path = root / 'manifest.json'
    start = time.perf_counter()
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        assert manifest['repository'] == repo and manifest['revision'] == revision
        for file in manifest['files']:
            assert hashlib.sha256((root / file['name']).read_bytes()).hexdigest() == file['sha256']
        print(f'{key}: reused verified files', flush=True)
        continue
    with urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}/revision/{revision}?blobs=true', timeout=60) as response:
        metadata = json.load(response)
    assert metadata['sha'] == revision
    entries = {f['rfilename']: f for f in metadata['siblings']}
    files = []
    for name in selected:
        entry = entries[name]
        url = f'https://huggingface.co/{repo}/resolve/{revision}/{name}'
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            staged = target.with_name(target.name + '.partial')
            print(f'{key}: downloading {name} ({entry["size"]} bytes)', flush=True)
            with urllib.request.urlopen(url, timeout=120) as response, staged.open('wb') as output:
                while block := response.read(1024 * 1024):
                    output.write(block)
            data = staged.read_bytes()
            assert len(data) == entry['size']
            if 'lfs' in entry:
                assert hashlib.sha256(data).hexdigest() == entry['lfs']['sha256']
            else:
                assert hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest() == entry['blobId']
            staged.rename(target)
        data = target.read_bytes()
        assert len(data) == entry['size']
        expected = entry.get('lfs', {}).get('sha256')
        if expected:
            assert hashlib.sha256(data).hexdigest() == expected
        else:
            assert hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest() == entry['blobId']
        files.append(dict(name=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), url=url))
    manifest = dict(repository=repo, revision=revision, licence='Apache-2.0', files=files,
                    assetBytes=sum(f['bytes'] for f in files), preparationSeconds=time.perf_counter()-start,
                    maxTokens=512)
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'{key}: verified {manifest["assetBytes"]} bytes in {manifest["preparationSeconds"]:.2f}s', flush=True)
