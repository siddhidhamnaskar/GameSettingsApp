import { useMemo, useState } from 'react';
import './App.css';

function App() {
  const serialNumberOptions = useMemo(() => [
    'SN-001',
    'SN-002',
    'SN-003',
    'SN-004',
    'SN-005'
  ], []);

  const [selectedSerialNumber, setSelectedSerialNumber] = useState(serialNumberOptions[0]);
  const [selectedModel, setSelectedModel] = useState('0');
  const [selectedTimeMinutes, setSelectedTimeMinutes] = useState(1);
  const [selectedSoundLevel, setSelectedSoundLevel] = useState(0);
  const [queryOutput, setQueryOutput] = useState('');

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
  };

  const handleQuerySMode = () => {
    setQueryOutput(`SMode? -> ${selectedSoundLevel}`);
  };

  const handleQueryPTime = () => {
    setQueryOutput(`PTime? -> ${selectedTimeMinutes}`);
  };

  return (
    <div className="App">
      <main className="App-main">
        <form className="settings-container" onSubmit={handleSubmit}>
          <h1 className="title">Device Settings</h1>

          <section className="section">
            <label htmlFor="serial-select" className="label">Choose Serial Number</label>
            <select
              id="serial-select"
              className="select"
              value={selectedSerialNumber}
              onChange={(e) => setSelectedSerialNumber(e.target.value)}
            >
              {serialNumberOptions.map((sn) => (
                <option key={sn} value={sn}>{sn}</option>
              ))}
            </select>
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
              <button type="button" className="btn" onClick={handleQueryAll}>Query</button>
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
