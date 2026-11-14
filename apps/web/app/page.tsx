import type { JSX } from 'react';

import { Editor } from './Editor';

export default function HomePage(): JSX.Element {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem' }}>
      <h1>Collaborative Editor</h1>
      <p>Open this page in two browser tabs and start typing — updates are relayed live.</p>
      <Editor />
    </main>
  );
}
