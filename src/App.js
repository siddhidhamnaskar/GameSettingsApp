import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

function App() {
  const defaultSerialNumberOptions = useMemo(() => [
    'SN-001',
    'SN-002',
    'SN-003',
    'SN-004',
    'SN-005'
  ], []);

  const [serialNumberOptions, setSerialNumberOptions] = useState([]);
  const [isLoadingSerials, setIsLoadingSerials] = useState(false);
  const [serialsError, setSerialsError] = useState('');
  const [selectedSerialNumber, setSelectedSerialNumber] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedTimeMinutes, setSelectedTimeMinutes] = useState('');
  const [selectedSoundLevel, setSelectedSoundLevel] = useState('');
  const [queryOutput, setQueryOutput] = useState('');
  const [selectedLightTime,setSelectedLightTime]=useState('');

  // WebSocket state
  const defaultWsUrl = useMemo(() => (
    (typeof process !== 'undefined' && process.env && process.env.REACT_APP_WS_URL) || 'ws://localhost:6060'
  ), []);
  // Max heartbeat age for filtering (minutes); default to 3
  const maxHeartbeatMinutes = useMemo(() => {
    const raw = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_MAX_HEARTBEAT_MINUTES) || '';
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  }, []);
  // Background-only; no UI state needed
  const wsRef = useRef(null);
  
  useEffect(() => {
    wsRef.current = new WebSocket(`${process.env.REACT_APP_WS_URL}`);
    const ws = wsRef.current;
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log(data);
      console.log(data.topic);
      if (data.topic === `GVC/KP/ALL`) {
        const cleanedValue = data.value.replace(/[*#]/g, '');
        const parts = cleanedValue.split(',');
        console.log(parts);
        console.log(selectedSerialNumber);
        if(parts[0]==selectedSerialNumber)
        {
          console.log("Matched");
          if(parts[1].includes('GMode'))
          {
            setQueryOutput(`GMode? -> ${parts[2]}`);
          }
          else if(parts[1].includes('SMode'))
          {
            setQueryOutput(`SMode? -> ${parts[2]}`);
          }
           else if(parts[1].includes('PTime'))
          {
            setQueryOutput(`PTime? -> ${parts[2]}`);
          }
        }
        
        
      }
    };
    ws.onopen = () => {
      console.log('WebSocket connection established');
    };
    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    return () => {
      ws.close();
    };
  }, [selectedSerialNumber]);

 

  const sendWsCommand = (value) => {
    try {
      const socket = wsRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = {
          topic: `GVC/KP/${selectedSerialNumber}`,
          value
        };
        socket.send(JSON.stringify(payload));
      }
    } catch (_) {
      // eslint-disable-next-line no-console
      console.warn('[WS send] failed for command', value);
    }
  };

 

  const extractSerialsFromApiResponse = (data) => {
    if (!data) return [];
    const tryKeys = [
      'SNoutput',
      'DeviceNumber',
      'deviceNumber',
      'serial',
      'serialNumber',
      'serial_no',
      'serialNo',
      'deviceSerial',
      'device_serial',
      'imei',
      'id',
      'name'
    ];
    const asArray = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.items) ? data.items : [];
    if (!Array.isArray(asArray)) return [];
    if (asArray.length === 0) return [];
    if (typeof asArray[0] === 'string') return asArray.filter(Boolean);
    if (typeof asArray[0] === 'object') {
      const first = asArray[0] || {};
      const foundKey = tryKeys.find((k) => Object.prototype.hasOwnProperty.call(first, k)) || '';
      // Extract and filter by last heartbeat time
      const nowMs = Date.now();
      const maxAgeMs = maxHeartbeatMinutes * 60 * 1000;
      const heartbeatKeys = [
        'lastHeartBeatTime',
        'LastHeartBeatTime',
        'lastHeartbeatTime',
        'lastHeartbeat',
        'last_seen',
        'lastSeen'
      ];
      const getHeartbeatMs = (obj) => {
        for (const key of heartbeatKeys) {
          const value = obj?.[key];
          if (value == null) continue;
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            const asNumber = Number(value);
            if (Number.isFinite(asNumber)) return asNumber;
            const parsed = Date.parse(value);
            if (Number.isFinite(parsed)) return parsed;
          }
        }
        return undefined;
      };
      const withHeartbeat = asArray.filter((obj) => typeof obj === 'object' && obj);
      const recent = withHeartbeat
        .map((obj) => ({ obj, hb: getHeartbeatMs(obj) }))
        .filter(({ hb }) => typeof hb === 'number' && nowMs - hb <= maxAgeMs)
        .sort((a, b) => (b.hb || 0) - (a.hb || 0))
        .map(({ obj }) => obj);
      const baseArray = recent.length > 0 ? recent : withHeartbeat;
      if (foundKey) {
        return baseArray.map((item) => String(item[foundKey])).filter(Boolean);
      }
      return asArray.map((item, idx) => String(item?.serial || item?.serialNumber || item?.id || `SN-${idx + 1}`)).filter(Boolean);
    }
    return [];
  };

  const loadSerialNumbers = async () => {
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:9000/game/active';
    setIsLoadingSerials(true);
    setSerialsError('');
    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
    
        
      });
      console.log(response);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = await response.json();
      const serials = extractSerialsFromApiResponse(data);
      if (serials.length > 0) {
        setSerialNumberOptions(serials);
        console.log(serials);
        setSelectedSerialNumber(serials[0]);
      } else {
        setSerialNumberOptions(defaultSerialNumberOptions);
        setSelectedSerialNumber(defaultSerialNumberOptions[0]);
        setSerialsError('No active devices by lastHeartBeatTime filter. Using defaults.');
      }
    } catch (error) {
      setSerialNumberOptions(defaultSerialNumberOptions);
      setSelectedSerialNumber(defaultSerialNumberOptions[0]);
      setSerialsError(`Failed to load serials. Using defaults. ${error?.message || ''}`.trim());
    } finally {
      setIsLoadingSerials(false);
    }
  };

  useEffect(() => {
    loadSerialNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send message to WebSocket when model changes (skip initial render)
  const didSendInitialModelRef = useRef(false);
  useEffect(() => {
    if (!didSendInitialModelRef.current) {
      didSendInitialModelRef.current = true;
      return;
    }
    try {
      const socket = wsRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = {
          topic: `GVC/KP/${selectedSerialNumber}`,
          value: `*GMode:${selectedModel}#`
        };
        console.log(payload);
        socket.send(JSON.stringify(payload));
      }
    } catch (_) {
      // eslint-disable-next-line no-console
      console.warn('[WS send] failed for model change');
    }
  }, [selectedModel, selectedSerialNumber]);

  // Send message to WebSocket when time changes (skip initial render)
  const didSendInitialTimeRef = useRef(false);
  useEffect(() => {
    if (!didSendInitialTimeRef.current) {
      didSendInitialTimeRef.current = true;
      return;
    }
    try {
      const socket = wsRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = {
          topic: `GVC/KP/${selectedSerialNumber}`,
          value: `*PTime:${selectedTimeMinutes}#`
        };
        socket.send(JSON.stringify(payload));
      }
    } catch (_) {
      // eslint-disable-next-line no-console
      console.warn('[WS send] failed for time change');
    }
  }, [selectedTimeMinutes]);

  // Send message to WebSocket when sound changes (skip initial render)
  const didSendInitialSoundRef = useRef(false);
  useEffect(() => {
    if (!didSendInitialSoundRef.current) {
      didSendInitialSoundRef.current = true;
      return;
    }
    try {
      const socket = wsRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = {
          topic: `GVC/KP/${selectedSerialNumber}`,
          value: `*SMode:${selectedSoundLevel}#`
        };
        socket.send(JSON.stringify(payload));
      }
    } catch (_) {
      // eslint-disable-next-line no-console
      console.warn('[WS send] failed for sound change');
    }
  }, [selectedSoundLevel]);


  // Send message to WebSocket when LightTime changes (skip initial render)
  const didSendInitialLightTimeRef = useRef(false);
  useEffect(() => {
    if (!didSendInitialLightTimeRef.current) {
      didSendInitialLightTimeRef.current = true;
      return;
    }
    try {
      const socket = wsRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = {
          topic: `GVC/KP/${selectedSerialNumber}`,
          value: `*Mod2LT:${selectedLightTime}#`
        };
        socket.send(JSON.stringify(payload));
      }
    } catch (_) {
      // eslint-disable-next-line no-console
      console.warn('[WS send] failed for sound change');
    }
  },[selectedLightTime]);


  useEffect(()=>{
     setSelectedLightTime('');
     setSelectedModel('');
     setSelectedSoundLevel('');
     setSelectedTimeMinutes('');
  },[selectedSerialNumber])

  const handleSubmit = (event) => {
    event.preventDefault();
  };

  const handleQueryAll = () => {
    setQueryOutput(
      `Serial: ${selectedSerialNumber}\nModel: ${selectedModel === '0' ? 'Model 0 - All buttons OKAY' : 'Model 1 - Press Light Button'}\nTime: ${selectedTimeMinutes} min\nSound: ${selectedSoundLevel}`
    );
  };

  const handleQueryGMode = () => {
    // setQueryOutput(`GMode? -> ${selectedModel}`);
    sendWsCommand('*GMode?#');
  };

  const handleQuerySMode = () => {
    // setQueryOutput(`SMode? -> ${selectedSoundLevel}`);
    sendWsCommand('*SMode?#');
  };

  const handleQueryPTime = () => {
    // setQueryOutput(`PTime? -> ${selectedTimeMinutes}`);
    sendWsCommand('*PTime?#');
  };

   const handleQueryLightTime = () => {
    // setQueryOutput(`PTime? -> ${selectedTimeMinutes}`);
    sendWsCommand('*Mode2LT?#');
  };

return (
  <div className="App">
    <main className="App-main">
      <form className="settings-container" onSubmit={handleSubmit}>
        <h1 className="title">Device Settings</h1>

        {/* Serial Number */}
        <section className="section">
          <label htmlFor="serial-select" className="label">Choose Serial Number</label>
          {serialsError ? (
            <div className="error" role="alert" style={{ color: '#ff8080', marginBottom: 8 }}>{serialsError}</div>
          ) : null}
          <select
            id="serial-select"
            className="select"
            value={selectedSerialNumber}
            onChange={(e) => setSelectedSerialNumber(e.target.value)}
            disabled={isLoadingSerials}
          >
            {serialNumberOptions.map((sn) => (
              <option key={sn} value={sn}>{sn}</option>
            ))}
          </select>
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={loadSerialNumbers} disabled={isLoadingSerials}>
              {isLoadingSerials ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        
        </section>
          {/* 👉 description BELOW */}
          <p className="description">Select the device’s serial number to configure.</p>

        {/* Model */}
        <section className="section">
          <label htmlFor="model-select" className="label">Choose Model</label>
          <select
            id="model-select"
            className="select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <option value="">Select GameMode</option>
            <option value="0">Model 0 - All buttons OKAY</option>
            <option value="1">Model 1 - Press Light Button</option>
            <option value="2">Model 2 - Play In Sequence</option>
          </select>
         
        </section>
         <p className="description">Select the game mode or model type for this device.</p>

        {/* Time */}
        <section className="section">
          <div className="label">Set Time (minutes)</div>
          <div className="radio-group" role="radiogroup" aria-label="Set Time">
            {[1, 2, 5, 10].map((minutes) => (
              <label key={minutes} className={`radio-option ${selectedTimeMinutes === minutes ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="time"
                  value={minutes}
                  checked={selectedTimeMinutes === minutes}
                  onChange={() => setSelectedTimeMinutes(minutes)}
                />
                {minutes}
              </label>
            ))}
          </div>
          
        </section>
        <p className="description">Set how long the game session will last.</p>

        {/* Sound */}
        <section className="section">
          <div className="label">Set Sound</div>
          <div className="radio-group" role="radiogroup" aria-label="Set Sound">
            {[0, 1, 2, 3, 4].map((level) => (
              <label key={level} className={`radio-option ${selectedSoundLevel === level ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="sound"
                  value={level}
                  checked={selectedSoundLevel === level}
                  onChange={() => setSelectedSoundLevel(level)}
                />
                {level}
              </label>
            ))}
          </div>
         
        </section>
         <p className="description">Adjust the sound type of the device.</p>

        {/* Mode2 Light Time */}
        <section className="section">
          <div className="label">Set Mode2 Light Time</div>
          <div className="radio-group" role="radiogroup" aria-label="Set Light Time">
            {[1, 2, 3, 4, 5].map((level) => (
              <label key={level} className={`radio-option ${selectedLightTime === level ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="lightTime"
                  value={level}
                  checked={selectedLightTime === level}
                  onChange={() => setSelectedLightTime(level)}
                />
                {level}
              </label>
            ))}
          </div>
         
        </section>
         <p className="description">Time each light stays ON in Mode 2 (seconds).</p>

        {/* Queries */}
        <section className="section section--queries">
          <div className="label">Queries</div>
          <div className="actions">
            <button type="button" className="btn" onClick={handleQueryGMode}>GMode?</button>
            <button type="button" className="btn" onClick={handleQuerySMode}>SMode?</button>
            <button type="button" className="btn" onClick={handleQueryPTime}>PTime?</button>
            <button type="button" className="btn" onClick={handleQueryLightTime}>Mode2LightTime?</button>
          </div>
          <p className="description">Send commands to check current settings on the device.</p>
          <pre className="output" aria-live="polite">{queryOutput}</pre>
        </section>
      </form>
    </main>
  </div>
);


}

export default App;
