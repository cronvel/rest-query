/*
	The Cedric's Swiss Knife (CSK) - CSK REST Query test suite

	Copyright (c) 2015 Cédric Ronvel 
	
	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/


var http = require( 'http' ) ;
var restQuery = require( '../../lib/restQuery.js' ) ;

var config = require( './app-config.js' ) ;



var port = process.argv[ 2 ] || 1234 ;



var app = restQuery.createApp( { protocol: 'http' , host: 'localhost' , port: port } ) ;
//var performer = app.createPerformer() ;

var usersNode = app.createUsersCollectionNode( config.descriptors.users ) ;
var authNode = app.createAuthCollectionNode( config.descriptors.auth ) ;   

var blogsNode = app.createCollectionNode( 'blogs' , config.descriptors.blogs ) ;
var postsNode = app.createCollectionNode( 'posts' , config.descriptors.posts ) ;
var commentsNode = app.createCollectionNode( 'comments' , config.descriptors.comments ) ;

app.root.contains( usersNode ) ;
app.root.contains( blogsNode ) ;
blogsNode.contains( postsNode ) ;
postsNode.contains( commentsNode ) ;





var server = http.createServer() ;

server.listen( port ) ;

/*
server.on( 'request' , function requestHandler( httpRequest , httpResponse ) {
	httpResponse.writeHeader( 200 ) ;
	httpResponse.end( 'Bob!' ) ;
} ) ;
//*/

server.on( 'request' , restQuery.httpModule.requestHandler.bind( app ) ) ;





