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

var ErrorStatus = require( 'error-status' ) ;
var doormen = require( 'doormen' ) ;
var hash = require( 'hash-kit' ) ;
var tree = require( 'tree-kit' ) ;





			/* GroupsCollectionNode */



function GroupsCollectionNode() { throw new Error( '[restQuery] Cannot create a GroupsCollectionNode object directly' ) ; }
module.exports = GroupsCollectionNode ;

GroupsCollectionNode.prototype = Object.create( restQuery.CollectionNode.prototype ) ;
GroupsCollectionNode.prototype.constructor = restQuery.GroupsCollectionNode ;



// WIP...

GroupsCollectionNode.schema = tree.extend( { deep: true } , {} , restQuery.CollectionNode.schema , {
	
} ) ;



GroupsCollectionNode.create = function createGroupsCollectionNode( app , schema , collectionNode )
{
	if ( ! collectionNode ) { collectionNode = Object.create( restQuery.GroupsCollectionNode.prototype ) ; }
	
	//console.log( '\nIncoming schema:' , schema , '\n' ) ;
	doormen( GroupsCollectionNode.schema , schema ) ;
	//console.log( '\nAfter doormen schema:' , schema ) ;
	
	schema.properties.name = {
		type: 'string' ,
		tier: 0 ,
		minLength: 1
	} ;
	
	schema.properties.users = {
		type: 'array' ,
		tier: 2 ,
		default: []
	} ;
	
	// No hook for instance
	//schema.hooks.beforeCreateDocument.push( beforeCreateDocumentHook ) ;
	
	// One unique name among siblings
	schema.indexes.push( { properties: { name: 1 , "parent.id": 1 } , unique: true } ) ;
	
	// Multikey index: permit finding a user id in the array, using $in
	schema.indexes.push( { properties: { users: 1 } } ) ;
	
	// Call the parent constructor
	restQuery.CollectionNode.create( app , 'groups' , schema , collectionNode ) ;
	
	// Add methods
	//collectionNode.methods.createToken = createToken.bind( collectionNode ) ;
	
	return collectionNode ;
} ;



function beforeCreateDocumentHook( incomingDocument )
{
	return incomingDocument ;
}




