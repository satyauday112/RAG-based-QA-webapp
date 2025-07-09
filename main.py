import uuid
import time
from typing import Dict
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from langchain_community.vectorstores.faiss import FAISS
from langchain.schema import Document
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
from langchain_huggingface import HuggingFaceEmbeddings
import os
from io import BytesIO
from langchain_community.document_loaders.parsers import PyPDFParser
from langchain_core.document_loaders import BaseLoader
from langchain_core.documents.base import Blob
from typing import List, Optional, Union

load_dotenv()



class CustomPDFLoader(BaseLoader):
    def __init__(self, stream: BytesIO, password: Optional[Union[str, bytes]] = None, extract_images: bool = False):
        self.stream = stream
        self.parser = PyPDFParser(password=password, extract_images=extract_images)

    def load(self) -> List[Document]:
        blob = Blob.from_data(self.stream.getvalue())
        return list(self.parser.parse(blob))


# Initialize FastAPI & scheduler
app = FastAPI()
app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")
scheduler = BackgroundScheduler()
scheduler.start()

gemini = ChatGoogleGenerativeAI(model="models/gemini-2.5-flash")
# model_name = "sentence-transformers/all-mpnet-base-v2"
print("Loading HuggingFace Embeddings Model")
embeddings = HuggingFaceEmbeddings(cache_folder='embeddings')

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TTL = 300  # 5 minutes in seconds
user_stores: Dict[str, Dict] = {}


def cleanup():
    now = time.time()
    stale = [uid for uid, entry in user_stores.items() if now - entry["last_used"] > TTL]
    for uid in stale:
        del user_stores[uid]
        print(f"🗑️ Cleaned up store for user {uid}")

scheduler.add_job(cleanup, "interval", seconds=60)

class Query(BaseModel):
    user_id: str
    query: str


@app.post("/upload/")
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    bytes_stream = BytesIO(data)

    try:
        pdf = CustomPDFLoader(bytes_stream).load_and_split()
    
        vectorstore = FAISS.from_documents(pdf, embeddings)

        user_id = str(uuid.uuid4())
        user_stores[user_id] = {"vectorstore": vectorstore, "last_used": time.time()}

    except Exception as e:
        raise HTTPException(status_code=422, detail='Can\'t process document')

    return {"user_id": user_id, "chunks": len(pdf)}

@app.post("/query/")
async def query_endpoint(payload: Query):
    entry = user_stores.get(payload.user_id)
    if not entry:
        raise HTTPException(status_code=400, detail="Session expired or not found")

    # update timestamp
    entry["last_used"] = time.time()
    vectorstore: FAISS = entry["vectorstore"]

    # perform similarity search using LangChain wrapper
    docs = vectorstore.similarity_search(payload.query, k=5)
    context = "\n\n".join([d.page_content for d in docs])
    
    prompt = f"Context:\n{context}\n\nQuestion: {payload.query}\nAnswer:"

    try:
        answer = gemini.invoke(prompt)
    except Exception as e:
        raise HTTPException(status_code=444, detail="LLM is not working")

    return {"answer": answer.content}

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    full = os.path.join("static", full_path)
    if os.path.isfile(full):
        return FileResponse(full)
    return FileResponse("static/index.html")
