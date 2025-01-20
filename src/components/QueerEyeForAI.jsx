import { useState, useRef, useEffect } from 'react';
import './QueerEyeForAI.css';

function QueerEyeForAI() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [numAgents, setNumAgents] = useState(2);
  const [agent1Personality, setAgent1Personality] = useState('');
  const [agent2Personality, setAgent2Personality] = useState('');
  const [commentaryStyle, setCommentaryStyle] = useState('Roast');
  const [clipSamplingInterval, setClipSamplingInterval] = useState(1.0);
  const [conversationSpeed, setConversationSpeed] = useState('Medium Pace');
  const [targetVideoLength, setTargetVideoLength] = useState(15);
  const [log, setLog] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentSize, setCurrentSize] = useState(5);
  const [canvasInterval, setCanvasInterval] = useState(null);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const canvasRef = useRef(null);
  const contextRef = useRef(null);

  // Initial canvas setup - only run once
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = 800;
    canvas.height = 600;
    
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.strokeStyle = currentColor;
    context.lineWidth = currentSize;
    contextRef.current = context;

    // Set initial white background
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    canvas._hasContent = true;
  }, []); // Empty dependency array - only run once

  // Update context properties without resetting canvas
  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = currentColor;
      contextRef.current.lineWidth = currentSize;
    }
  }, [currentColor, currentSize]);

  const startDrawing = ({ nativeEvent }) => {
    const { offsetX, offsetY } = nativeEvent;
    contextRef.current.beginPath();
    contextRef.current.moveTo(offsetX, offsetY);
    setIsDrawing(true);
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing) return;
    
    const { offsetX, offsetY } = nativeEvent;
    contextRef.current.lineTo(offsetX, offsetY);
    contextRef.current.stroke();
  };

  const finishDrawing = () => {
    contextRef.current.closePath();
    setIsDrawing(false);
    
    // Send canvas data to AI when stroke is complete
    if (dcRef.current?.readyState === 'open') {
      const canvas = canvasRef.current;
      const imageData = canvas.toDataURL('image/png').split(',')[1]; // Remove data URL prefix
      const message = {
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: `You are an AI commentator with two distinct personalities:
                       Agent 1 Personality: ${agent1Personality}
                       Agent 2 Personality: ${agent2Personality}
                       
                       Your commentary style is: ${commentaryStyle}
                       
                       You are viewing a drawing. Here is the base64 image data:
                       data:image/png;base64,${imageData}
                       
                       Please analyze and comment on what you see in the drawing.
                       Be specific about shapes, lines, colors, and patterns you observe.
                       Stay in character and maintain your personality.
                       Be entertaining and engaging.
                       Interact with each other as you comment.`
        }
      };
      dcRef.current.send(JSON.stringify(message));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = currentColor;
    context.lineWidth = currentSize;
    canvas._hasContent = false;
  };

  // Add state for subtitles
  const [subtitles, setSubtitles] = useState([]);

  // Update the message handler to store subtitles
  useEffect(() => {
    if (dcRef.current) {
      dcRef.current.onmessage = (e) => {
        try {
          const realtimeEvent = JSON.parse(e.data);
          setLog(oldLog => [...oldLog, JSON.stringify(realtimeEvent, null, 2)]);
          
          // Extract text content for subtitles
          if (realtimeEvent.delta?.text) {
            setSubtitles(prev => {
              const newSubtitles = [...prev, realtimeEvent.delta.text];
              // Keep only last 5 subtitle entries
              return newSubtitles.slice(-5);
            });
          }
        } catch (err) {
          console.error('Failed to parse data channel message:', err);
          setLog(oldLog => [...oldLog, `Error parsing message: ${err.message}`]);
        }
      };
    }
  }, []);  // Remove dcRef.current from dependencies to prevent recreation

  const handleGenerateCommentary = async () => {
    try {
      setLog(oldLog => [...oldLog, "Connecting to server..."]);
      
      const resp = await fetch('http://localhost:3001/session');
      const data = await resp.json();
      console.log('Server response:', data);

      if (!resp.ok) {
        throw new Error(data.error || 'Failed to get session token');
      }

      if (data.error) {
        throw new Error(`API Error: ${data.error}`);
      }

      if (!data.client_secret?.value) {
        throw new Error('Invalid session token response: No client_secret.value');
      }

      const EPHEMERAL_KEY = data.client_secret.value;
      setLog(oldLog => [...oldLog, "Got session token"]);

      const pc = new RTCPeerConnection();
      
      pc.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          setLog(oldLog => [...oldLog, "ICE candidate found"]);
        }
      };

      pc.onconnectionstatechange = () => {
        setLog(oldLog => [...oldLog, `Connection state: ${pc.connectionState}`]);
      };

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      setLog(oldLog => [...oldLog, "Microphone access granted"]);

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        setLog(oldLog => [...oldLog, "Data channel opened"]);
        // Send initial message once connected
        const initialMessage = {
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
            instructions: `You are an AI commentator with two distinct personalities:
                         Agent 1 Personality: ${agent1Personality}
                         Agent 2 Personality: ${agent2Personality}
                         
                         Your commentary style is: ${commentaryStyle}
                         
                         When commenting on drawings:
                         - Imagine you're watching someone draw on an 800x600 canvas
                         - Describe what you think they might be drawing
                         - React to imagined lines, shapes, and colors being added
                         - Stay in character and maintain your personality
                         - Be entertaining and engaging
                         - Interact with each other as you comment
                         
                         When commenting on videos:
                         - Sample clips every ${clipSamplingInterval} seconds
                         - Maintain a ${conversationSpeed} conversation pace
                         - Target a ${targetVideoLength} second commentary
                         - React to the YouTube content at: ${youtubeUrl}
                         - Describe what you imagine seeing in vivid detail
                         - Stay in character and maintain your personality
                         
                         Remember to:
                         - Be descriptive and specific in your commentary
                         - React to what you imagine is happening in real-time
                         - Keep your assigned personality traits consistent
                         - Engage with each other's comments
                         - Make it entertaining and fun!`
          }
        };
        dc.send(JSON.stringify(initialMessage));
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setLog(oldLog => [...oldLog, "Created offer"]);

      const baseUrl = 'https://api.openai.com/v1/realtime';
      const model = 'gpt-4o-realtime-preview-2024-12-17';

      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp'
        },
      });

      if (!sdpResponse.ok) {
        throw new Error('Failed to get SDP answer');
      }

      const answer = {
        type: 'answer',
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);
      setLog(oldLog => [...oldLog, "Connection established"]);

      pcRef.current = pc;

    } catch (error) {
      console.error('Error generating commentary:', error);
      setLog(oldLog => [...oldLog, `Error: ${error.toString()}`]);
      if (error.details) {
        setLog(oldLog => [...oldLog, `Details: ${JSON.stringify(error.details, null, 2)}`]);
      }
    }
  };

  const toggleRecording = () => {
    if (!isRecording && pcRef.current) {
      const mediaRecorder = new MediaRecorder(audioRef.current.srcObject);
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ai-commentary.webm';
        a.click();
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } else if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Update the periodic canvas sampling
  useEffect(() => {
    if (dcRef.current?.readyState === 'open') {
      const interval = setInterval(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          const imageData = canvas.toDataURL('image/png').split(',')[1];
          const message = {
            type: 'response.create',
            response: {
              modalities: ['text', 'audio'],
              instructions: `You are an AI commentator with two distinct personalities:
                           Agent 1 Personality: ${agent1Personality}
                           Agent 2 Personality: ${agent2Personality}
                           
                           Your commentary style is: ${commentaryStyle}
                           
                           You are viewing a drawing. Here is the base64 image data:
                           data:image/png;base64,${imageData}
                           
                           Please analyze and comment on the overall progress of the drawing.
                           Be specific about shapes, lines, colors, and patterns you observe.
                           Stay in character and maintain your personality.
                           Be entertaining and engaging.
                           Interact with each other as you comment.`
            }
          };
          dcRef.current.send(JSON.stringify(message));
        }
      }, 5000); // Sample every 5 seconds

      setCanvasInterval(interval);
      return () => clearInterval(interval);
    }
  }, [dcRef.current?.readyState, agent1Personality, agent2Personality, commentaryStyle]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (canvasInterval) {
        clearInterval(canvasInterval);
      }
    };
  }, [canvasInterval]);

  return (
    <div className="queer-eye-container">
      <h1>Peanut Gallery</h1>
      
      <div className="sketchpad-container">
        <div className="sketchpad-controls">
          <input 
            type="color" 
            value={currentColor} 
            onChange={(e) => {
              setCurrentColor(e.target.value);
              contextRef.current.strokeStyle = e.target.value;
            }} 
          />
          <input 
            type="range" 
            min="1" 
            max="20" 
            value={currentSize} 
            onChange={(e) => {
              setCurrentSize(e.target.value);
              contextRef.current.lineWidth = e.target.value;
            }} 
          />
          <button onClick={clearCanvas}>Clear Canvas</button>
        </div>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseUp={finishDrawing}
          onMouseMove={draw}
          onMouseLeave={finishDrawing}
          className="sketchpad"
        />
        <div className="subtitles-box">
          {subtitles.map((text, index) => (
            <p key={index} className="subtitle-line">{text}</p>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>YouTube URL:</label>
        <input 
          type="text" 
          value={youtubeUrl} 
          onChange={(e) => setYoutubeUrl(e.target.value)} 
        />
      </div>

      <div className="form-group">
        <label>Number of AI Agents:</label>
        <input 
          type="number" 
          min={1} 
          value={numAgents} 
          onChange={(e) => setNumAgents(e.target.value ? parseInt(e.target.value, 10) : 2)} 
        />
      </div>

      <div className="form-group">
        <label>Agent 1 personality:</label>
        <input 
          type="text" 
          value={agent1Personality} 
          onChange={(e) => setAgent1Personality(e.target.value)} 
        />
      </div>

      <div className="form-group">
        <label>Agent 2 personality:</label>
        <input 
          type="text" 
          value={agent2Personality} 
          onChange={(e) => setAgent2Personality(e.target.value)} 
        />
      </div>

      <div className="form-group">
        <label>Commentary Style:</label>
        <select 
          value={commentaryStyle} 
          onChange={(e) => setCommentaryStyle(e.target.value)}
        >
          <option>Roast</option>
          <option>Supportive</option>
          <option>Comedic</option>
          <option>Analytical</option>
        </select>
      </div>

      <div className="form-group">
        <label>Clip Sampling Interval (seconds):</label>
        <input 
          type="number" 
          step="0.1" 
          value={clipSamplingInterval} 
          onChange={(e) => setClipSamplingInterval(e.target.value ? parseFloat(e.target.value) : 1.0)} 
        />
      </div>

      <div className="form-group">
        <label>Conversation Speed:</label>
        <select 
          value={conversationSpeed} 
          onChange={(e) => setConversationSpeed(e.target.value)}
        >
          <option>Slow Pace</option>
          <option>Medium Pace</option>
          <option>Fast Pace</option>
        </select>
      </div>

      <div className="form-group">
        <label>Target Video Length (seconds):</label>
        <input 
          type="number" 
          value={targetVideoLength} 
          onChange={(e) => setTargetVideoLength(e.target.value ? parseInt(e.target.value, 10) : 15)} 
        />
      </div>

      <div className="button-group">
        <button onClick={handleGenerateCommentary} className="primary-button">
          Generate Commentary
        </button>
        <button 
          onClick={toggleRecording} 
          className={`record-button ${isRecording ? 'recording' : ''}`}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
      </div>

      <div className="commentary-log">
        <h3>Realtime AI Commentary</h3>
        <div className="log-content">
          {log.map((l, idx) => (
            <div key={idx} className="log-entry">
              {l}
            </div>
          ))}
        </div>
      </div>

      <audio ref={audioRef} autoPlay controls style={{ marginTop: '1rem' }} />
    </div>
  );
}

export default QueerEyeForAI; 