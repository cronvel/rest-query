/*
	The Cedric's Swiss Knife (CSK) - CSK REST Query

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



var misc = {} ;
module.exports = misc ;



misc.pathToArray = function pathToArray( path )
{
	if ( typeof path === 'string' ) { path = path.split( '/' ) ; }
	if ( ! Array.isArray( path ) ) { throw new Error( "[restQuery] .pathToArray() 'path' should be a string or an array" ) ; }
	if ( path[ 0 ] === '' ) { path = path.slice( 1 ) ; }
	if ( path[ path.length - 1 ] === '' ) { path = path.slice( 0 , path.length - 1 ) ; }
	//# debug : console.log( '[restQuery] .pathToArray():' , path ) ;
	return path ;
} ;





