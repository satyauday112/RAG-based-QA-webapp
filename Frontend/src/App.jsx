import React, { useState, useRef, useEffect } from 'react';
import { Worker, Viewer, ScrollMode } from '@react-pdf-viewer/core';
import { zoomPlugin } from '@react-pdf-viewer/zoom';
import { toolbarPlugin } from '@react-pdf-viewer/toolbar';
import { selectionModePlugin, SelectionMode } from '@react-pdf-viewer/selection-mode';
import { Form, Button, Card } from 'react-bootstrap';
import axios from 'axios';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/zoom/lib/styles/index.css';
import '@react-pdf-viewer/toolbar/lib/styles/index.css';
import '@react-pdf-viewer/selection-mode/lib/styles/index.css';

function Divider({ onDrag }) {
    const ref = useRef(null);
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const onMouseMove = (e) => onDrag(e.movementX);
        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        const onMouseDown = () => {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };
        node.addEventListener('mousedown', onMouseDown);
        return () => node.removeEventListener('mousedown', onMouseDown);
    }, [onDrag]);

    return <div ref={ref} style={{ width: '6px', cursor: 'col-resize', backgroundColor: '#ccc' }} />;
}

export default function App() {
    const [pdfUrl, setPdfUrl] = useState(null);
    const [messages, setMessages] = useState([]);
    const [current, setCurrent] = useState('');
    const [userId, setUserId] = useState(null);
    const [leftWidth, setLeftWidth] = useState(500);
    const containerRef = useRef(null);
    const viewerWrapper = useRef(null);

    const zoomPluginInstance = zoomPlugin({ enableShortcuts: false });
    const { zoomTo, CurrentScale } = zoomPluginInstance;

    const selectionPluginInstance = selectionModePlugin({ selectionMode: SelectionMode.Hand });
    const toolbarPluginInstance = toolbarPlugin();
    const { Toolbar, renderDefaultToolbar } = toolbarPluginInstance;

    const transformToolbar = (slot) => ({
        ...slot,
        Open: () => <></>,
        Download: () => <></>,
        DownloadMenuItem: () => <></>,
        Print: () => <></>,
        PrintMenuItem: () => <></>,
        SwitchTheme: () => <></>,
        SwitchThemeMenuItem: () => <></>,
        MoreActionsPopover: () => <></>,
        EnterFullScreen: slot.EnterFullScreen,
        ZoomIn: slot.ZoomIn,
        ZoomOut: slot.ZoomOut,
        ShowSearchPopover: slot.ShowSearchPopover,
        GoToPreviousPage: slot.GoToPreviousPage,
        CurrentPageInput: slot.CurrentPageInput,
        NumberOfPages: slot.NumberOfPages,
        GoToNextPage: slot.GoToNextPage,
    });

    useEffect(() => {
        const el = viewerWrapper.current;
        if (!el) return;
        const handler = (e) => {
            if (e.shiftKey && e.deltaY) {
                e.preventDefault();
                zoomTo((scale) => (e.deltaY < 0 ? scale + 0.1 : Math.max(scale - 0.1, 0.1)));
            }
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, [zoomTo]);

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setPdfUrl(URL.createObjectURL(file));

        const fd = new FormData();
        fd.append('file', file);

        try {
            setMessages([{ sender: 'bot', text: 'Processing PDF...' }]);
            const { data } = await axios.post('upload/', fd);
            setUserId(data.user_id);
            
            setMessages([{ sender: 'bot', text: 'PDF processed. Ask me anything!' }]);
        } catch (err) {
            setMessages([{ sender: 'bot', text: 'Upload failed. Try again.' }]);
        }
    };

    const sendQuery = async () => {
        if (!current.trim() || !userId) return;
        const query = current;
        setMessages((m) => [...m, { sender: 'user', text: query }]);
        setCurrent('');

        try {
            const { data } = await axios.post('query/', {
                user_id: userId,
                query,
            });
            setMessages((m) => [...m, { sender: 'bot', text: data.answer }]);
        } catch (err) {
            if (err.response?.status === 400) {
                setMessages((m) => [...m, { sender: 'bot', text: 'Session expired. Please re-upload the PDF.' }]);
                setUserId(null);
            } else {
                setMessages((m) => [...m, { sender: 'bot', text: 'Error retrieving answer.' }]);
            }
        }
    };

    const handleDrag = (dx) => {
        setLeftWidth((w) => {
            const min = 200;
            const total = containerRef.current?.clientWidth || 800;
            const max = total - 200;
            const nw = w + dx;
            return nw < min ? min : nw > max ? max : nw;
        });
    };

    return (
        <div ref={containerRef} style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            <div style={{ width: leftWidth, display: 'flex', flexDirection: 'column', padding: '1rem', boxSizing: 'border-box' }}>
                <Form.Control type="file" accept="application/pdf" onChange={handleUpload} className="mb-3" />
                {pdfUrl ? (
                    <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ padding: '0.5rem', borderBottom: '1px solid #ddd', background: '#f8f9fa' }}>
                            <Toolbar>{renderDefaultToolbar(transformToolbar)}</Toolbar>
                            <div style={{ marginTop: '0.5rem' }}><CurrentScale /></div>
                        </div>
                        <div ref={viewerWrapper} style={{ flex: 1, overflowY: 'auto', height: '100%' }}>
                            <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                                <Viewer
                                    fileUrl={pdfUrl}
                                    plugins={[zoomPluginInstance, selectionPluginInstance, toolbarPluginInstance]}
                                    scrollMode={ScrollMode.Vertical}
                                />
                            </Worker>
                        </div>
                    </Card>
                ) : (
                    <div style={{ textAlign: 'center', marginTop: '2rem' }}>Upload a PDF to preview</div>
                )}
            </div>

            <Divider onDrag={handleDrag} />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem', boxSizing: 'border-box' }}>
                <h5>Chat Bot</h5>
                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #ddd', padding: '1rem' }}>
                    {messages.map((m, i) => (
                        <div key={i} className={m.sender === 'bot' ? 'text-start mb-2' : 'text-end mb-2'}>
                            <b>{m.sender === 'bot' ? 'Bot:' : 'You:'}</b><div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked(m.text))}} /> 
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', marginTop: '0.5rem' }}>
                    <Form.Control
                        type="text"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                        placeholder="Ask a question..."
                    />
                    <Button variant="primary" onClick={sendQuery} className="ms-2">Send</Button>
                </div>
            </div>
        </div>
    );
}
