import { useState, useRef } from 'react';
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

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  const handleGenerateCommentary = async () => {
    try {
      setLog(oldLog => [...oldLog, "Connecting to server..."]);
      
      const resp = await fetch('http://localhost:3001/session');
      if (!resp.ok) {
        throw new Error('Failed to get session token');
      }
      const data = await resp.json();
      if (!data.client_secret?.value) {
        throw new Error('Invalid session token response');
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
            instructions: `You are Agent 1: ${agent1Personality}; 
                         You are Agent 2: ${agent2Personality}.
                         Commentary style: ${commentaryStyle}.
                         Clip sampling: ${clipSamplingInterval}s
                         Speed: ${conversationSpeed}
                         Target length: ${targetVideoLength} seconds
                         (Use the YouTube content at: ${youtubeUrl} for context!)`
          }
        };
        dc.send(JSON.stringify(initialMessage));
      };

      dc.onmessage = (e) => {
        try {
          const realtimeEvent = JSON.parse(e.data);
          setLog(oldLog => [...oldLog, JSON.stringify(realtimeEvent, null, 2)]);
        } catch (err) {
          console.error('Failed to parse data channel message:', err);
          setLog(oldLog => [...oldLog, `Error parsing message: ${err.message}`]);
        }
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

  return (
    <div className="queer-eye-container">
      <h1>Queer Eye for the AI</h1>
      
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