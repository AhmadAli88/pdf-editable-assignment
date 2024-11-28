/*eslint-disable*/
import React, { useRef, useState, useEffect } from "react";
import { pdfjs } from "react-pdf";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// Set worker source
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

function EditablePDFViewer() {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [mode, setMode] = useState(null); // Modes: "pen", "text", "highlight", null
  const [highlights, setHighlights] = useState([]); // Store highlights

  const canvasRef = useRef(null);
  const pdfBytesRef = useRef(null);

  // Load the PDF file into memory
  useEffect(() => {
    const fetchPDF = async () => {
      const pdfBytes = await fetch("../assets/sample.pdf").then((res) =>
        res.arrayBuffer()
      );
      pdfBytesRef.current = pdfBytes;
    };
    fetchPDF();
  }, []);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  // Function to render the current page on the canvas
  const renderPageToCanvas = () => {
    const canvas = canvasRef.current;
    const canvasContext = canvas.getContext("2d");
    const pdfBytes = pdfBytesRef.current;

    const renderPage = async () => {
      const loadingTask = pdfjs.getDocument({ data: pdfBytes });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pageNumber);

      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext,
        viewport,
      };
      await page.render(renderContext).promise();

      // Draw existing highlights on top of the page
      if (highlights.length > 0) {
        const highlightCtx = canvas.getContext("2d");
        highlights.forEach((highlight) => {
          highlightCtx.fillStyle = "rgba(255, 255, 0, 0.5)";
          highlightCtx.fillRect(highlight.x, highlight.y, highlight.width, highlight.height);
        });
      }
    };

    renderPage();
  };

  useEffect(() => {
    if (pdfBytesRef.current) renderPageToCanvas();
  }, [pageNumber, highlights]); // Re-render PDF on page or highlight change

  // Enable drawing functionality (for pen mode)
  const enableDrawing = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let isDrawing = false;

    const startDrawing = (e) => {
      isDrawing = true;
      ctx.beginPath();
      const rect = canvas.getBoundingClientRect();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    };

    const draw = (e) => {
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    };

    const stopDrawing = () => {
      isDrawing = false;
      ctx.closePath();
    };

    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDrawing);

    // Cleanup when switching modes
    return () => {
      canvas.removeEventListener("mousedown", startDrawing);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", stopDrawing);
    };
  };

  // Add text to the canvas (for text mode)
  const addText = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const text = prompt("Enter the text to add:");
    if (text) {
      ctx.font = "16px Arial";
      ctx.fillStyle = "blue";
      ctx.fillText(text, x, y);
    }
  };

  // Highlight text (for highlight mode)
  const enableHighlighting = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();

    // Capture the mouse click coordinates
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    const mouseMoveHandler = (moveEvent) => {
      const endX = moveEvent.clientX - rect.left;
      const endY = moveEvent.clientY - rect.top;

      // Calculate highlight box size
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);

      // Draw a preview of the highlight on canvas
      renderPageToCanvas(); // Re-render the PDF to avoid clearing it
      ctx.fillStyle = "rgba(255, 255, 0, 0.5)";
      ctx.fillRect(x, y, width, height);
    };

    const mouseUpHandler = (upEvent) => {
      const endX = upEvent.clientX - rect.left;
      const endY = upEvent.clientY - rect.top;

      // Calculate highlight box size
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);

      setHighlights((prevHighlights) => [
        ...prevHighlights,
        { x, y, width, height },
      ]);

      canvas.removeEventListener("mousemove", mouseMoveHandler);
      canvas.removeEventListener("mouseup", mouseUpHandler);
    };

    canvas.addEventListener("mousemove", mouseMoveHandler);
    canvas.addEventListener("mouseup", mouseUpHandler);
  };

  const savePDFWithChanges = async () => {
    try {
      // Load the existing PDF document
      const pdfDoc = await PDFDocument.load(pdfBytesRef.current);
      
      // Get the canvas image (without detaching the ArrayBuffer)
      const canvas = canvasRef.current;
      const imageBytes = await fetch(canvas.toDataURL("image/png")).then(res => res.arrayBuffer());
      const image = await pdfDoc.embedPng(imageBytes);
  
      // Get the current page and its size
      const page = pdfDoc.getPage(pageNumber - 1);
      const { width, height } = page.getSize();
  
      // Draw the image on the PDF page
      page.drawImage(image, {
        x: 0,
        y: 0,
        width,
        height,
      });
  
      // Save the updated PDF and trigger the download
      const updatedPdfBytes = await pdfDoc.save();
      saveAs(new Blob([updatedPdfBytes]), "edited-sample.pdf");
    } catch (error) {
      console.error("Error saving PDF with changes:", error);
    }
  };
  

  return (
    <div style={{ textAlign: "center", position: "relative" }}>
      <div style={{ marginBottom: "10px" }}>
        <button
          onClick={() => {
            setMode("pen");
            enableDrawing();
          }}
          style={{
            padding: "10px 20px",
            margin: "0 10px",
            backgroundColor: mode === "pen" ? "#007bff" : "#ccc",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Edit (Pen)
        </button>
        <button
          onClick={() => setMode("text")}
          style={{
            padding: "10px 20px",
            margin: "0 10px",
            backgroundColor: mode === "text" ? "#007bff" : "#ccc",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Add Text
        </button>
        <button
          onClick={() => setMode("highlight")}
          style={{
            padding: "10px 20px",
            margin: "0 10px",
            backgroundColor: mode === "highlight" ? "#007bff" : "#ccc",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Highlight
        </button>
        <button
          onClick={savePDFWithChanges}
          style={{
            padding: "10px 20px",
            margin: "0 10px",
            backgroundColor: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Save PDF
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onClick={(e) => {
          if (mode === "text") addText(e);
        }}
        onMouseDown={(e) => {
          if (mode === "highlight") enableHighlighting(e);
        }}
        style={{
          border: "1px solid #000",
          cursor: mode === "text" ? "text" : mode === "pen" ? "crosshair" : mode === "highlight" ? "pointer" : "default",
        }}
      />
      <div style={{ marginTop: "20px" }}>
        <button
          onClick={() => setPageNumber(pageNumber > 1 ? pageNumber - 1 : 1)}
          disabled={pageNumber <= 1}
          style={{
            padding: "8px 16px",
            margin: "0 10px",
            backgroundColor: pageNumber <= 1 ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: pageNumber <= 1 ? "not-allowed" : "pointer",
          }}
        >
          Previous Page
        </button>
        <span>
          Page {pageNumber} of {numPages}
        </span>
        <button
          onClick={() => setPageNumber(pageNumber < numPages ? pageNumber + 1 : numPages)}
          disabled={pageNumber >= numPages}
          style={{
            padding: "8px 16px",
            margin: "0 10px",
            backgroundColor: pageNumber >= numPages ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: pageNumber >= numPages ? "not-allowed" : "pointer",
          }}
        >
          Next Page
        </button>
      </div>
    </div>
  );
}

export default EditablePDFViewer;
