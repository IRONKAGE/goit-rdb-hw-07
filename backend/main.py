from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text, create_engine
import json, os

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

CONFIG_FILE = "databases.json"
engine_cache = {}

def get_engine(db_id: str):
    if db_id in engine_cache: return engine_cache[db_id]
    if not os.path.exists(CONFIG_FILE): raise HTTPException(500, "databases.json не знайдено")
    with open(CONFIG_FILE, "r") as f: config = json.load(f)
    if db_id not in config: raise HTTPException(404, f"БД {db_id} не існує")

    new_engine = create_engine(config[db_id]["url"])
    engine_cache[db_id] = new_engine
    return new_engine

class SQLReq(BaseModel):
    sql: str
    db_id: str

@app.get("/health")
def health(): return {"status": "ok"}

@app.get("/databases")
def get_dbs():
    return json.load(open(CONFIG_FILE)) if os.path.exists(CONFIG_FILE) else {}

@app.post("/execute")
def execute(req: SQLReq):
    try:
        eng = get_engine(req.db_id)

        # 1. Розбиваємо скрипт на окремі команди
        # Використовуємо .split(';'), прибираємо зайві пробіли та пусті елементи
        statements = [s.strip() for s in req.sql.split(';') if s.strip()]

        if not statements:
            return {"columns": ["Info"], "rows": [["No SQL statements found"]]}

        final_columns = ["Status"]
        final_rows = [["Script executed successfully"]]

        with eng.connect() as conn:
            # 2. Починаємо транзакцію (AUTO-COMMIT/ROLLBACK)
            with conn.begin():
                for stmt in statements:
                    res = conn.execute(text(stmt))

                    # 3. Якщо запит повернув дані (SELECT, SHOW, EXPLAIN)
                    # Ми зберігаємо їх, щоб повернути фронтенду останній наявний результат
                    if res.returns_rows:
                        final_columns = list(res.keys())
                        # Перетворюємо об'єкти рядків у звичайні списки для JSON
                        final_rows = [list(r) for r in res.fetchall()]

            # Якщо все пройшло успішно, повертаємо результат
            return {"columns": final_columns, "rows": final_rows}

    except Exception as e:
        # Важливо: повертаємо текст помилки у форматі detail, щоб FastAPI правильно його прокинув
        raise HTTPException(status_code=400, detail=str(e))
