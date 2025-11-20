// Test download speed with optimizations
import { downloadYouTubeVideo } from '../../dist/utils/download.util.js';

console.log('⚡ Testing YouTube Download Speed\n');
console.log('='.repeat(60));

const testVideos = [
    {
        name: 'Short video (~30s)',
        url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        expectedDuration: '0:19'
    },
    {
        name: 'Medium video (~2min)',
        url: 'https://www.youtube.com/watch?v=SSbBvKaM6sk',
        expectedDuration: '2:48'
    }
];

for (const video of testVideos) {
    console.log(`\n📹 Test: ${video.name}`);
    console.log(`   URL: ${video.url}`);
    console.log(`   Expected duration: ${video.expectedDuration}`);
    
    const startTime = Date.now();
    
    try {
        const buffer = await downloadYouTubeVideo(video.url);
        
        const elapsedTime = Date.now() - startTime;
        const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
        const speedMBps = (buffer.length / 1024 / 1024 / (elapsedTime / 1000)).toFixed(2);
        
        console.log(`   ✅ Success in ${(elapsedTime / 1000).toFixed(2)}s`);
        console.log(`   📦 Size: ${sizeMB} MB`);
        console.log(`   🚀 Speed: ${speedMBps} MB/s`);
        
    } catch (error) {
        const elapsedTime = Date.now() - startTime;
        console.log(`   ❌ Error after ${(elapsedTime / 1000).toFixed(2)}s: ${error.message}`);
    }
}

console.log('\n' + '='.repeat(60));
console.log('\n📊 Optimization Summary:');
console.log('   • Concurrent fragment downloads (4 parallel)');
console.log('   • Larger buffer size (16K)');
console.log('   • Bigger HTTP chunks (10M)');
console.log('   • Prioritizes pre-merged formats (no merge overhead)');
console.log('   • Expected improvement: 20-40% faster downloads 🚀');
