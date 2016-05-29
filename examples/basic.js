var PSG = require("phantomjs-sitemap-generator");

if( process.argv.length > 2 ) {
  var options = { verbose: true };
  //var options = { verbose: true, sitemap: false };
  //var options = { verbose: true, userAgent: 'Facebot' };
  var psg = new PSG( process.argv.slice( 2 )[0], options );
  psg.crawl().then( function( result ) {
    console.log( '[ok]' );
    console.log( result );
  }, function( result ) {
    console.log( '[err]' );
    console.log( result );
  }, function( result ) {
    console.log( '[!]' );
    console.log( result );
  });
}
else console.log( '! url required' );
