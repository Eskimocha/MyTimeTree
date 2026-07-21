from fastapi import FastAPI

app = FastAPI()


@app.get("/hello/{name}")
def hello(name: str) -> dict[str, str]:
    return {"message": f"Hello, World {name}"}
