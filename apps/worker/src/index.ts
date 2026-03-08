import { startScheduler } from './scheduler';

console.log('=== iPhone Price Tracker Worker ===');
console.log(`Ortam: ${process.env.NODE_ENV ?? 'development'}`);
console.log(`Mock Providers: ${process.env.USE_MOCK_PROVIDERS === 'true' ? 'Evet' : 'Hayır'}`);
console.log('==================================');

startScheduler().catch((err) => {
  console.error('[worker] Kritik hata:', err);
  process.exit(1);
});
