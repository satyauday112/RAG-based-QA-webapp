# RAG-based-QA-webapp

This is a simple Retrieval-Augmented Generation (RAG) web application where users can upload their documents and ask questions based on the content.

### Technologies Used
- FAISS for vector search
- Gemini API for response generation
- Hugging Face Instruct Embeddings for text embeddings
- React for frontend

### Setup Instructions

1. Add your Gemini API key to a `.env` file:

```
GEMINI_API_KEY="YOUR_API_KEY"
```

2. In the project directory, run:

```
uv sync
.venv/Scripts/activate
fastapi run main.py
```

## Sample Pictures
![Sample Image](Sample%20Images/image.png)

That's it.
