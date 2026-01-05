import React, { useState } from 'react';

const FIELD_TYPE_OPTIONS = [
  { label: 'String', value: 'string' },
  { label: 'Number', value: 'number' },
  { label: 'Email', value: 'email' },
  { label: 'Date', value: 'date' },
  { label: 'Boolean', value: 'boolean' },
];

function getTypeOptions(fieldName: string) {
  // Context-aware type options (simple example)
  if (/account|number|id/i.test(fieldName)) {
    return [
      { label: 'Number', value: 'number' },
      { label: 'String', value: 'string' },
    ];
  }
  if (/email/i.test(fieldName)) {
    return [
      { label: 'Email', value: 'email' },
      { label: 'String', value: 'string' },
    ];
  }
  return FIELD_TYPE_OPTIONS;
}

function generateTestData(fieldName: string, type: string) {
  // Simple mock data generator
  const positive: any[] = [];
  const negative: any[] = [];
  for (let i = 0; i < 10; i++) {
    switch (type) {
      case 'string':
        positive.push(`${fieldName}_value_${i+1}`);
        negative.push('');
        break;
      case 'number':
        positive.push(1000 + i);
        negative.push('abc');
        break;
      case 'email':
        positive.push(`user${i+1}@example.com`);
        negative.push('not-an-email');
        break;
      case 'date':
        positive.push(`2025-09-${String(i+1).padStart(2,'0')}`);
        negative.push('invalid-date');
        break;
      case 'boolean':
        positive.push(i % 2 === 0 ? true : false);
        negative.push('not-a-boolean');
        break;
      default:
        positive.push('test');
        negative.push('');
    }
  }
  return { positive, negative };
}

const TestCaseGenerator: React.FC = () => {
  const [fields, setFields] = useState([
    { name: '', type: 'string' }
  ]);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFieldChange = (idx: number, key: 'name' | 'type', value: string) => {
    setFields(fields => fields.map((f, i) => i === idx ? { ...f, [key]: value } : f));
  };

  const addField = () => {
    setFields(fields => [...fields, { name: '', type: 'string' }]);
  };

  const handleGenerate = () => {
    setError(null);
    for (const field of fields) {
      if (!field.name.trim()) {
        setError('Field Name is required for all fields.');
        return;
      }
    }
    const data: any = {};
    fields.forEach(field => {
      data[field.name] = generateTestData(field.name, field.type);
    });
    setResults(data);
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', background: '#fff', borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', padding: 32 }}>
      <h2 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: 24 }}>Test Case Generator</h2>
      {fields.map((field, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 24, marginBottom: 16, alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label style={{ fontWeight: 600, color: '#2c3e50', marginBottom: 8, display: 'block' }}>Field Name</label>
            <input
              type="text"
              value={field.name}
              onChange={e => handleFieldChange(idx, 'name', e.target.value)}
              placeholder="Enter field name..."
              style={{ width: '100%', padding: 10, borderRadius: 6, border: '2px solid #e1e8ed', fontSize: 15 }}
              required
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontWeight: 600, color: '#2c3e50', marginBottom: 8, display: 'block' }}>Type</label>
            <select
              value={field.type}
              onChange={e => handleFieldChange(idx, 'type', e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 6, border: '2px solid #e1e8ed', fontSize: 15 }}
            >
              {getTypeOptions(field.name).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <button
          type="button"
          onClick={addField}
          style={{ background: '#27ae60', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 600, fontSize: 16, cursor: 'pointer', boxShadow: '0 1px 4px rgba(39,174,96,0.08)' }}
        >
          Add Another Field
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          style={{ background: '#3498db', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 600, fontSize: 16, cursor: 'pointer', boxShadow: '0 1px 4px rgba(52,152,219,0.08)' }}
        >
          Generate
        </button>
      </div>
      {error && <div style={{ background: '#ee2610ff', color: '#fff', padding: 12, borderRadius: 6, marginBottom: 16 }}>{error}</div>}
      {results && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ color: '#2c3e50', marginBottom: 12 }}>Results</h3>
          {Object.entries(results).map(([field, data]: any) => (
            <div key={field} style={{ marginBottom: 24 }}>
              <h4 style={{ color: '#34495e', marginBottom: 8 }}>{field}</h4>
              <div style={{ display: 'flex', gap: 32 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#27ae60', marginBottom: 6 }}>Positive Test Cases</div>
                  <ul style={{ background: '#f8f9fa', borderRadius: 6, padding: 12 }}>
                    {data.positive.map((val: any, i: number) => (
                      <li key={i} style={{ marginBottom: 4 }}>{val.toString()}</li>
                    ))}
                  </ul>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#ed2b16ff', marginBottom: 6 }}>Negative Test Cases</div>
                  <ul style={{ background: '#f8f9fa', borderRadius: 6, padding: 12 }}>
                    {data.negative.map((val: any, i: number) => (
                      <li key={i} style={{ marginBottom: 4 }}>{val.toString()}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TestCaseGenerator;
