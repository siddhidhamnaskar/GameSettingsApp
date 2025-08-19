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

  const [serialNumberOptions, setSerialNumberOptions] = useState(defaultSerialNumberOptions);
  const [isLoadingSerials, setIsLoadingSerials] = useState(false);
  const [serialsError, setSerialsError] = useState('');
  const [selectedSerialNumber, setSelectedSerialNumber] = useState(defaultSerialNumberOptions[0]);
  const [selectedModel, setSelectedModel] = useState('0');
  const [selectedTimeMinutes, setSelectedTimeMinutes] = useState(1);
  const [selectedSoundLevel, setSelectedSoundLevel] = useState(0);
  const [queryOutput, setQueryOutput] = useState('');

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
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(false);

  const connectWebSocket = (url) => {
    if (!url) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      try { wsRef.current.close(); } catch (_) {}
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    try {
      const socket = new WebSocket(url);
      wsRef.current = socket;
      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };
      socket.onmessage = (event) => {
        try {
          // App currently does not display messages; log for debugging
          // Remove or replace with app-specific side effects as needed
          // eslint-disable-next-line no-console
          console.log('[WS message]', event.data);
        } catch (_) {}
      };
      socket.onerror = () => {
        // eslint-disable-next-line no-console
        console.warn('[WS error]');
      };
      socket.onclose = () => {
        if (shouldReconnectRef.current) {
          const attempt = Math.min(reconnectAttemptsRef.current + 1, 6);
          reconnectAttemptsRef.current = attempt;
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 15000);
          reconnectTimerRef.current = setTimeout(() => connectWebSocket(url), delayMs);
        }
      };
    } catch (_) {
      // eslint-disable-next-line no-console
      console.warn('[WS exception]');
    }
  };

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

  useEffect(() => {
    // Auto-connect on mount
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    connectWebSocket(defaultWsUrl);
    return () => {
      // cleanup on unmount
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
      }
    };
  }, [defaultWsUrl]);

  const extractSerialsFromApiResponse = (data) => {
    if (!data) return [];
    const tryKeys = [
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
        setSelectedSerialNumber((prev) => serials.includes(prev) ? prev : serials[0]);
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
  }, [selectedTimeMinutes, selectedSerialNumber]);

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
  }, [selectedSoundLevel, selectedSerialNumber]);

  const handleSubmit = (event) => {
    event.preventDefault();
  };

  const handleQueryAll = () => {
    setQueryOutput(
      `Serial: ${selectedSerialNumber}\nModel: ${selectedModel === '0' ? 'Model 0 - All buttons OKAY' : 'Model 1 - Press Light Button'}\nTime: ${selectedTimeMinutes} min\nSound: ${selectedSoundLevel}`
    );
  };

  const handleQueryGMode = () => {
    setQueryOutput(`GMode? -> ${selectedModel}`);
    sendWsCommand('*GMode?#');
  };

  const handleQuerySMode = () => {
    setQueryOutput(`SMode? -> ${selectedSoundLevel}`);
    sendWsCommand('*SMode?#');
  };

  const handleQueryPTime = () => {
    setQueryOutput(`PTime? -> ${selectedTimeMinutes}`);
    sendWsCommand('*PTime?#');
  };

  return (
    <div className="App">
      <main className="App-main">
        <form className="settings-container" onSubmit={handleSubmit}>
          <h1 className="title">Device Settings</h1>

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

          <section className="section">
            <label htmlFor="model-select" className="label">Choose Model</label>
            <select
              id="model-select"
              className="select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="0">Model 0 - All buttons OKAY</option>
              <option value="1">Model 1 - Press Light Button</option>
            </select>
          </section>

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

          <section className="section section--queries">
            <div className="label">Queries</div>
            <div className="actions">
              {/* <button type="button" className="btn" onClick={handleQueryAll}>Query</button> */}
              <button type="button" className="btn" onClick={handleQueryGMode}>GMode?</button>
              <button type="button" className="btn" onClick={handleQuerySMode}>SMode?</button>
              <button type="button" className="btn" onClick={handleQueryPTime}>PTime?</button>
            </div>
            <pre className="output" aria-live="polite">{queryOutput}</pre>
          </section>
        </form>
      </main>
    </div>
  );
}

export default App;
