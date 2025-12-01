import subprocess
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
VALIDATOR_SCRIPT = BASE_DIR / "validator" / "validate.js"

def validate_code_ast(code: str) -> dict:
    """
    Runs the Node/Babel validator and returns:
    {
      "safe": bool,
      "reasons": [str, ...]
    }
    """
    try:
        proc = subprocess.run(
            ["node", str(VALIDATOR_SCRIPT)],
            input=code,
            text=True,
            capture_output=True,
            check=False,
        )
    except FileNotFoundError:
        # Node not installed or not in PATH
        return {
            "safe": False,
            "reasons": ["Node.js not found when running validator."],
        }

    if proc.returncode != 0:
        # Node crashed or syntax error in JS file
        return {
            "safe": False,
            "reasons": [
                "Validator crashed.",
                f"stderr: {proc.stderr.strip()}"
            ],
        }

    try:
        result = json.loads(proc.stdout.strip())
    except json.JSONDecodeError:
        return {
            "safe": False,
            "reasons": ["Validator output was not valid JSON."],
        }

    # Make sure expected keys exist
    result.setdefault("safe", False)
    result.setdefault("reasons", [])
    return result
