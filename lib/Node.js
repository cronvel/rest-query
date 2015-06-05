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



// Load modules
var restQuery = require( './restQuery.js' ) ;





			/* Common Node -- shared between ObjectNode & CollectionNode */



function Node() { throw new Error( '[restQuery] Cannot create a Node object directly' ) ; }
module.exports = Node ;

Node.prototype.constructor = Node ;



// autoSID: the current collection will be assumed if a SID is given
Node.prototype.contains = function contains( collectionNode , autoSID )
{
	if ( ! ( collectionNode instanceof restQuery.CollectionNode ) ) { throw new Error( '[restQuery] .constains() require argument #0 to be an instance of restQuery.CollectionNode' ) ; }
	
	// First check the child name
	if ( this.children[ collectionNode.name ] ) { throw new Error( '[restQuery] Cannot attach over an existing child: ' + this.children[ collectionNode.name ] ) ; }
	this.children[ collectionNode.name ] = collectionNode ;
	
	//return odm.collection ;
} ;



Node.parsePathNode = function parsePathNode( str )
{
	if ( typeof str !== 'string' ) { return new TypeError( '[restQuery] parsePathNode() : argument #0 should be a string' ) ; }
	
	if ( str.length < 1 ) { return new Error( '[restQuery] parsePathNode() : argument #0 length should be > 1' ) ; }
	if ( str.length > 72 ) { return new Error( '[restQuery] parsePathNode() : argument #0 length should be <= 72' ) ; }
	
	
	// Firstly, check if it is an object's property (or method): it starts with an uppercase ascii letter
	if ( restQuery.charmap.uppercaseArray.indexOf( str[ 0 ] ) !== -1 )
	{
		if ( ! str.match( restQuery.charmap.propertyRegExp ) )
		{
			return new Error( '[restQuery] parsePathNode() : argument #0 start with an uppercase but mismatch an object property type' ) ;
		}
		
		return {
			type: 'property' ,
			identifier: str[ 0 ].toLowerCase() + str.slice( 1 )
		} ;
	}
	
	// Secondly, check if it is an ID: it is a 24 characters string containing only hexadecimal
	if ( str.length === 24 && str.match( restQuery.charmap.idRegExp ) )
	{
		return {
			type: 'ID' ,
			identifier: str
		} ;
	}
	
	// Thirdly, check if it is an offset
	if ( str.match( restQuery.charmap.offsetRegExp ) )
	{
		return {
			type: 'offset' ,
			identifier: parseInt( str )
		} ;
	}
	
	// Fourthly, check if it is a SID
	if ( str.match( restQuery.charmap.sidRegExp ) )
	{
		return {
			type: 'SID' ,
			identifier: str
		} ;
	}
	
	// Nothing had matched... this is not a valid path node
	return new Error( '[restQuery] parsePathNode() : argument #0 does not validate' ) ;
} ;
