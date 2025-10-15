// Test comparing download sizes with different qualities
import { downloadYouTubeVideo } from './dist/utils/download.util.js';

async function compareQualities() {
    console.log('🧪 Testing Quality Impact on Download Size\n');
    console.log('=' .repeat(60));
    
    try {
        // Video em HD (tem versões 1080p, 720p, 480p, 360p disponíveis)
        const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Never Gonna Give You Up - HD
        
        console.log('\n📹 Testing video:', testUrl);
        console.log('   Quality limit: 480p (current setting)');
        console.log('   Downloading...\n');
        
        const startTime = Date.now();
        const videoBuffer = await downloadYouTubeVideo(testUrl);
        const downloadTime = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('\n📊 Results:');
        console.log(`   ✅ File size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   ⏱️  Download time: ${downloadTime}s`);
        console.log(`   📱 WhatsApp-friendly: ${videoBuffer.length < 16 * 1024 * 1024 ? 'Yes (< 16MB)' : 'No (> 16MB)'}`);
        
        console.log('\n💡 Benefits of 480p limit:');
        console.log('   • Faster downloads');
        console.log('   • Smaller file size');
        console.log('   • Better for mobile data');
        console.log('   • Still good quality for phones');
        console.log('   • Less chance of WhatsApp size limits');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

compareQualities();
