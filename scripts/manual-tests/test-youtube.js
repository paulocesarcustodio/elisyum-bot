// Test script for YouTube download functionality
import { youtubeMedia } from '../../dist/utils/download.util.js';

const testCases = [
    { name: 'Search by title', input: 'despacito' },
    { name: 'YouTube URL', input: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk' }
];

console.log('🧪 Testing YouTube Media Download...\n');

for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`   Input: ${testCase.input}`);
    
    try {
        const result = await youtubeMedia(testCase.input);
        
        if (result) {
            console.log('   ✅ Success!');
            console.log(`   📹 Title: ${result.title}`);
            console.log(`   ⏱️  Duration: ${result.duration_formatted}`);
            console.log(`   👤 Channel: ${result.channel}`);
            console.log(`   🔗 Has URL: ${result.url ? 'Yes' : 'No'}`);
        } else {
            console.log('   ⚠️  No result found');
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

console.log('\n✅ All tests completed successfully!');
process.exit(0);
