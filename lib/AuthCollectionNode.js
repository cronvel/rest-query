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





			/* AuthCollectionNode */



function AuthCollectionNode() { throw new Error( '[restQuery] Cannot create a AuthCollectionNode object directly' ) ; }
module.exports = AuthCollectionNode ;

AuthCollectionNode.prototype = Object.create( restQuery.CollectionNode.prototype ) ;
AuthCollectionNode.prototype.constructor = restQuery.AuthCollectionNode ;



AuthCollectionNode.create = function createAuthCollectionNode( app , descriptor , collectionNode )
{
	if ( ! collectionNode ) { collectionNode = Object.create( restQuery.AuthCollectionNode.prototype ) ; }
	
	descriptor.properties.collection = { constraint: 'string' } ;
	descriptor.properties.userID = { constraint: 'ID' } ;
	descriptor.properties.objectID = { constraint: 'ID' } ;
	
	descriptor.indexes.push( { properties: { userID: 1 , objectID: 1 , collection: 1 } , unique: true } ) ;
	
	restQuery.CollectionNode.create( app , 'auth' , descriptor , collectionNode ) ;
	//this.createCollectionNode( 'auth' , descriptor , collectionNode ) ;
	
	return collectionNode ;
} ;


