# This is the exact Python the lab page runs inside Pyodide.
import json
from sqlfluff.core import FluffConfig, Linter

def run(sql, config_text, dialect):
    cfg = FluffConfig.from_string(config_text, overrides={"dialect": dialect})
    result = Linter(config=cfg).lint_string(sql, fix=True)
    fixed = result.fix_string()[0]
    remaining = Linter(config=cfg).lint_string(fixed)
    return json.dumps({
        "fixed": fixed,
        "fixed_count": len(result.get_violations()) - len(remaining.get_violations()),
        "violations": [
            {"line": v.line_no, "pos": v.line_pos, "code": v.rule_code(), "name": v.rule_name() if hasattr(v, "rule_name") else "", "desc": v.desc()}
            for v in remaining.get_violations()
        ],
    })
