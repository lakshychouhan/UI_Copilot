import subprocess
import json

def validate_code_ast(code: str):
    proc = subprocess.run(
        ["node", "validator/validate.js", code],
        capture_output=True,
        text=True,
    )

    if proc.returncode != 0:
        return {"safe": False, "reasons": ["validator crashed"]}

    return json.loads(proc.stdout)
