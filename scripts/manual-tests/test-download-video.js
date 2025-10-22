// Test downloading YouTube video with yt-dlp
import { downloadYouTubeVideo } from '../../dist/utils/download.util.js';
import fs from 'fs';

async function testDownload() {
    console.log('🧪 Testing YouTube Video Download...\n');
    
    try {
        console.log('📹 Downloading short video (10 seconds)...');
        const videoUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // "Me at the zoo" - primeiro vídeo do YouTube (18s)
        
        const videoBuffer = await downloadYouTubeVideo(videoUrl);
        
        console.log(`✅ Download successful!`);
        console.log(`   Size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Buffer type: ${Buffer.isBuffer(videoBuffer) ? 'Valid Buffer' : 'Invalid'}`);
        
        // Verifica se o arquivo é um MP4 válido (começa com ftyp)
        const header = videoBuffer.slice(4, 8).toString();
        console.log(`   File type: ${header === 'ftyp' ? 'Valid MP4' : 'Unknown format'}`);
        
        // Salva temporariamente para verificação
        const testPath = '/tmp/test-youtube-download.mp4';
        fs.writeFileSync(testPath, videoBuffer);
        console.log(`   ✓ Saved test file to ${testPath}`);
        
        // Remove arquivo de teste
        fs.unlinkSync(testPath);
        console.log(`   ✓ Test file cleaned up`);
        
        console.log('\n✅ All tests passed!');
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

testDownload();
