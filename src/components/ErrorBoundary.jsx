import { Component } from 'react';

// Koi pan screen ma runtime error aave to blank screen ni jagya e sandesh batave.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" style={{ maxWidth: 640, margin: '40px auto', padding: 20, border: '1px solid #f0b8b8', borderRadius: 14, background: '#fff6f6', fontFamily: 'sans-serif' }}>
        <h2 style={{ marginTop: 0 }}>⚠ કંઈક ભૂલ થઈ</h2>
        <p>આ સ્ક્રીન ખુલી શકી નથી. પેજ Reload કરો; ફરી આવે તો નીચેનો સંદેશ ડેવલપરને મોકલો.</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#fff', padding: 10, borderRadius: 8 }}>{String(error?.message || error)}</pre>
        <button type="button" onClick={() => window.location.reload()}>↻ Reload</button>
      </div>
    );
  }
}
