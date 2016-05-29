(function() { "use strict";
  /*
   * Name: phantomjs-sitemap-generator
   * Description: PhantomJS sitemap generator
   * Author: Mat <mat@blocknot.es>
   *
   * Params:
   * - url: starting url (complete with scheme)
   * - options:
   *   - sitemap (string): sitemap output filename or false to disable - default: "sitemap.xml"
   *   - userAgent (string): user agent string - default: "Mozilla/5.0 (Unknown; Linux i686) AppleWebKit/538.1 (KHTML, like Gecko) PhantomJS/2.1.1 Safari/538.1"
   *   - verbose (boolean): show console messages - default: false
   *
   * ToDo:
   * - no parent option
   * - improve relative links check (ex. ../something)
   * - add options for sitemap generation (ex. priorities, changefreq, etc.)
   * - add urls ignore filters
   * - follow robots.txt directives
   * - follow redirects ? (30x status codes)
   * - depth ?
   *
   * - snapshot option: save HTML DOM to files
   * - test deferred crawl
   */

  // --- requires
  var _fs = require('fs');
  var _http = require( 'http' );
  var _phantom = require( 'phantom' );
  var _q = require( 'q' );
  var _sitemap = require( 'sitemap' );
  var _url = require( 'url' );

  // --- class
  function PSG( url0, options ) {
    if( !url0 ) throw( new Error( 'url required' ) );
    var urlObj = _url.parse( url0 );
    if( !urlObj.protocol || !urlObj.host ) throw( new Error( 'complete url required (with scheme)' ) );
    this.host = urlObj.hostname;
    this.path = urlObj.path;
    this.port = urlObj.port;
    //this.root = _url.resolve( urlObj, '/' );
    this.root = url0;
    // throw( new Error( 'DEBUG' ) );
    this.pos = 0;
    this.urls = {};
    this.urls[url0] = true;
    this.keys = Object.keys( this.urls );
    // options
    this.sitemap = ( options && typeof( options.sitemap ) !== 'undefined' ) ? options.sitemap : 'sitemap.xml';
    // this.snapshot = ( options && options.snapshot ) || false;  // TODO
    this.userAgent = ( options && options.userAgent ) || false;
    this.verbose = ( options && options.verbose ) || false;
  }

  // --- methods
  PSG.prototype.crawl = function() {
    var deferred = _q.defer();
    if( this.pos < this.keys.length ) {
      var url = this.keys[this.pos];
      var that = this;
      deferred.notify( { url: url } );
      this.checkURL( url ).then( function( type ) {
        that.urls[url] = false;
        if( type == 'text/html' )
        {
          that.parseURL( url ).then( function() {
            that.keys = Object.keys( that.urls );
            that.pos++;
            that.crawl();
          });
        }
      }, function() {
        that.urls[url] = false;
      });
    }
    else
    {
      var result = {};
      result['urls'] = this.pos;
      if( this.sitemap ) result['sitemap'] = this.generateSitemap();
      if( this.verbose ) console.log( '> finished' );
      return deferred.resolve( result );
    }

    return deferred.promise;
  };

  PSG.prototype.checkURL = function( url ) {
    var deferred = _q.defer();
    if( this.verbose ) console.log( "\n> checking... " + url );
    var options = { method: 'HEAD', host: this.host, port: this.port, path: this.path };
    var that = this;
    _http.request( options, function( res ) {
      if( that.verbose ) console.log( 'status: ' + res.statusCode );
      if( res.headers['content-type'] ) {
        // Extract mime-type
        var type = false;
        var props = res.headers['content-type'].split( ';' );
        for( var i = 0; i < props.length; i++ )
        {
          if( props[i].indexOf( '/' ) > 0 )
          {
            type = props[i].trim();
            break;
          }
        }
        if( type ) return deferred.resolve( type );
        else return deferred.reject( { error: 'content-type not available' } );
      }
      else return deferred.reject( { error: 'connection error' } );
    }).end();

    return deferred.promise;
  };

  PSG.prototype.generateSitemap = function() {
    if( this.verbose ) console.log( "\n> generating " + this.sitemap + "... " );
    var cnt = 0;
    var sitemap = {
      hostname: this.root,
      cacheTime: 600000,    // 600 sec (10 min) cache purge period
      urls: []
    };
    for( var url in this.urls )
    {
      sitemap.urls.push( { url: url, changefreq: 'weekly', priority: 0.8 } );
      cnt++;
    }
    var sm = _sitemap.createSitemap( sitemap );
    _fs.writeFileSync( this.sitemap, sm.toString() );
    if( this.verbose ) console.log( "done." );
    return cnt;
  };

  PSG.prototype.parseURL = function( url ) {
    var deferred = _q.defer();
    var that = this;
    var sitepage = null;
    var phInstance = null;
    _phantom.create()
      .then( function( instance ) {
        if( that.verbose ) console.log( '> crawling...' );
        phInstance = instance;
        return instance.createPage();
      })
      .then( function( page ) {
        sitepage = page;
        if( that.userAgent ) page.setting( 'userAgent', that.userAgent );
        return page.open( url );
      })
      .then( function( status ) {
        return sitepage.evaluate( function() {
          var list = {};
          var links = document.links;
          for( var i = 0; i < links.length; i++ ) {
            var link = links[i].toString();
            list[link] = true;
          }
          return list;
        });
      })
      // .then( function( list ) {
      //   if( that.snapshot ) console.log( sitepage.property( 'content' ) );
      //   return list;
      // })
      .then( function( list ) {
        sitepage.close();
        phInstance.exit();
        for( var link in list )
        {
          var u = _url.parse( link );
          if( u.host == that.host )
          { // Hosts links
            if( !that.urls.hasOwnProperty( link ) ) that.urls[link] = true;
          }
          else if( !u.protocol && !u.host )
          {  // Relative links
            var link2 = _url.resolve( that.root, link );
            if( !that.urls.hasOwnProperty( link2 ) ) that.urls[link2] = true;
          }
        }
        if( that.verbose ) console.log( 'done.' );

        return deferred.resolve();
      })
      .catch( function( error ) {
        phInstance.exit();
        if( that.verbose ) console.log( error );

        return deferred.reject( error );
      });

    return deferred.promise;
  };

  module.exports = PSG;
})();
