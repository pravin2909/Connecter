import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import text

from app.agent.tools import CAPABILITIES
from app.api.deps import DB, ContainerDep, CurrentUser
from mcp_servers.workspace import Workspace, WorkspaceError

router = APIRouter(tags=["system"])


@router.get("/health")
async def health(c: ContainerDep, db: DB):
    try:
        await db.execute(text("select 1"))
        db_ok = True
    except Exception:  # noqa: BLE001
        db_ok = False
    try:
        models = await c.llm.list_models()
        llm = {"ok": True, "model": c.llm.model, "loaded": c.llm.model in models, "available": models}
    except Exception as e:  # noqa: BLE001
        llm = {"ok": False, "model": c.llm.model, "error": type(e).__name__}
    return {
        "database": db_ok,
        "qdrant": await c.rag.store.ping(),
        "llm": llm,
        "mcp": c.mcp.status(),
        "workspace": str(c.settings.file_workspace),
    }


@router.get("/tools")
async def tools(c: ContainerDep, user: CurrentUser):
    specs = c.registry.specs().values()
    return [
        {
            "capability": cap,
            "description": desc,
            "available": cap in c.registry.available_capabilities(),
            "tools": [s.tool for s in specs if s.capability == cap],
        }
        for cap, desc in CAPABILITIES.items()
    ]


@router.get("/files")
async def files(c: ContainerDep, user: CurrentUser, path: str = "."):
    """Workspace browser for the UI - served through the File MCP like everything else."""
    out = await c.registry.call("file__list_files", {"path": path})
    if out.is_error:
        return {"error": out.text, "items": []}
    return json.loads(out.text)


@router.get("/files/download")
async def download(c: ContainerDep, user: CurrentUser, path: str):
    """Download a file from the workspace (e.g. a document the agent generated). Sandboxed
    to FILE_WORKSPACE; a signed-in user is required."""
    try:
        p = Workspace(c.settings.file_workspace).resolve(path, must_exist=True)
    except WorkspaceError as e:
        raise HTTPException(404, str(e)) from e
    if not p.is_file():
        raise HTTPException(404, "Not a file")
    return FileResponse(p, filename=p.name)


@router.get("/files/preview")
async def preview(c: ContainerDep, user: CurrentUser, path: str):
    """Inline preview of a generated file for the artifact card: the first rows of a
    spreadsheet/CSV as a table. Sandboxed; signed-in user required."""
    try:
        p = Workspace(c.settings.file_workspace).resolve(path, must_exist=True)
    except WorkspaceError as e:
        raise HTTPException(404, str(e)) from e
    if not p.is_file():
        raise HTTPException(404, "Not a file")
    ext = p.suffix.lower()
    text_exts = {".txt", ".md", ".markdown", ".json", ".py", ".js", ".ts", ".tsx", ".html", ".css",
                 ".yaml", ".yml", ".log", ".xml", ".sh", ".sql"}
    try:
        if ext in {".csv", ".tsv"}:
            import csv as _csv

            with p.open(newline="", encoding="utf-8", errors="replace") as f:
                rows = [r for r in _csv.reader(f, delimiter="\t" if ext == ".tsv" else ",")][:51]
        elif ext in {".xlsx", ".xlsm"}:
            from openpyxl import load_workbook

            wb = load_workbook(p, read_only=True, data_only=True)
            rows = []
            for i, row in enumerate(wb.active.iter_rows(values_only=True)):
                if i >= 51:
                    break
                rows.append(["" if v is None else str(v) for v in row])
        elif ext == ".docx":
            from docx import Document as _Docx

            body = "\n\n".join(par.text for par in _Docx(p).paragraphs if par.text.strip())
            return {"kind": "text", "format": "markdown", "text": body[:20_000]}
        elif ext == ".pdf":
            import fitz

            with fitz.open(p) as doc:
                parts = [page.get_text() for i, page in enumerate(doc) if i < 30]
            return {"kind": "text", "format": "plain", "text": "\n\n".join(parts)[:20_000]}
        elif ext in text_exts:
            body = p.read_text(encoding="utf-8", errors="replace")
            fmt = "markdown" if ext in {".md", ".markdown"} else "plain"
            return {"kind": "text", "format": fmt, "text": body[:20_000]}
        else:
            return {"kind": "unsupported"}
    except Exception as e:
        raise HTTPException(422, f"Could not preview file: {e}") from e
    rows = [r for r in rows if any(str(c) != "" for c in r)]
    if not rows:
        return {"kind": "empty"}
    return {"kind": "table", "columns": [str(c) for c in rows[0]], "rows": [[str(c) for c in r] for r in rows[1:]]}
