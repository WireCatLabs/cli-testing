"""Records the pipeline and sealed-input hashes before the calibration or evaluation split is scored."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', choices=['calibration', 'eval', 'holdout', 'long', 'blind'])
parser.add_argument('--mmr-lambda', type=float, required=True)
parser.add_argument('--variants', default='', help='variants chosen on the tuning set, as variants_report.py names them, joined by ;')
args = parser.parse_args()
root = Path(__file__).resolve().parent
output = root / 'results' / f'freeze-{args.stage}.json'
assert not output.exists(), 'already frozen'
code = ['PROTOCOL.md', 'CORPUS.md', 'pipeline.py', 'core/discover.mjs', 'core/package.json', 'core/pnpm-lock.yaml',
        'background.py', 'validate.py', 'report.py', 'variants_report.py', 'followups_report.py', 'long_report.py',
        'blind_gate.py', 'run.sh', 'models.json', 'requirements.lock']
digest = lambda path: hashlib.sha256((root / path).read_bytes()).hexdigest()
sealed = sorted(str(path.relative_to(root)) for folder in ('corpus', 'questions')
                for path in (root / folder / args.stage).glob('*.json'))
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps({
    'frozen_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
    'stage': args.stage, 'settings': {'mmr_lambda': args.mmr_lambda},
    'variants': [name for name in args.variants.split(';') if name],
    'code': {path: digest(path) for path in code}, 'inputs': {path: digest(path) for path in sealed},
}, indent=1) + '\n')
print(output)
