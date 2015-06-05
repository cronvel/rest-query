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
var ErrorStatus = require( 'error-status' ) ;

var restQuery = require( './restQuery.js' ) ;





			/* CollectionNode */



function CollectionNode() { throw new Error( '[restQuery] Cannot create a CollectionNode object directly' ) ; }
module.exports = CollectionNode ;

CollectionNode.prototype = Object.create( restQuery.Node.prototype ) ;
CollectionNode.prototype.constructor = CollectionNode ;



// Here we create an ObjectNode of part of the current CollectionNode
CollectionNode.prototype.createObjectNode = function createObjectNode( object , objectNode )
{
	var id ;
	
	if ( ! objectNode ) { objectNode = Object.create( restQuery.ObjectNode.prototype ) ; }
	
	this.app.createNode( objectNode , this.children ) ;
	
	if ( object )
	{
		if ( object.id ) { id = object.id ; }
		else if ( object.$ && object.$.id ) { id = object.$.id ; }
		else { id = null ; }
	}
	else
	{
		id = null ;
	}
	
	Object.defineProperties( objectNode , {
		collectionNode: { value: this , enumerable: true } ,
		object: { value: object , enumerable: true } ,
		id: { value: id , enumerable: true }
	} ) ;
	
	return objectNode ;
} ;



CollectionNode.prototype.get = function collectionNodeGet( path , context , callback )
{
	var self = this , parentCollectionName , fingerprint ;
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// First, check the ancestry chain: the current object should have
		// the previous object in the chain as its parent
		
		fingerprint = {} ;
		
		if ( context.parentNode && context.parentNode.id !== '/' )
		{
			parentCollectionName = context.parentNode.collectionNode.collection.name ;
			fingerprint[ 'parent.' + parentCollectionName ] = context.parentNode.id ;
		}
		
		this.collection.collect( fingerprint , function( error , batch ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			//console.log( '&&&&&&&&&&&&&&&&&&&& ' , string.inspect( { style: 'color' } , batch ) ) ;
			
			// /!\ 'auth' should iterate through all objects, and filter them
			
			callback( undefined , batch.export() , {} ) ;
		} ) ;
		
		return ;
	}
	
	var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				if ( error ) { callback( error ) ; return ; }
				
				// we instanciate an objectNode to query
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.get(
					path.slice( 1 ) ,
					{ performer: context.performer , parentNode: context.parentNode } ,
					callback
				) ;
			} ) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



CollectionNode.prototype.post = function collectionNodePost( path , rawDocument , context , callback )
{
	var self = this , document , parentCollectionName , id ;
	
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		id = this.collection.createId( rawDocument ) ;
		rawDocument.parent = {} ;
		
		if ( context.parentNode && context.parentNode.id !== '/' )
		{
			parentCollectionName = context.parentNode.collectionNode.collection.name ;
			rawDocument.parent[ parentCollectionName ] = context.parentNode.id ;
		}
		
		//document = self.collection.createDocument( rawDocument , { id: id } ) ;
		document = self.collection.createDocument( rawDocument ) ;
		
		// overwrite:true for race conditions?
		document.save( { overwrite: true } , function( error ) {
			if ( error ) { callback( error ) ; return ; }
			
			callback( undefined , { id: id } , { status: 201 } ) ;
		} ) ;
		
		return ;
	}
	
	var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				
				if ( error ) { callback( error ) ; }
				
				// The resource exists, overwrite or access should be done by the underlying ObjectNode
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.post(
					path.slice( 1 ) ,
					rawDocument ,
					{ performer: context.performer , parentNode: context.parentNode } ,
					callback
				) ;
			} ) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



CollectionNode.prototype.put = function collectionNodePut( path , rawDocument , context , callback )
{
	var self = this , parentCollectionName ;
	
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a PUT on a collection node' } ) ) ;
		return ;
	}
	
	var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				
				if ( error )
				{
					if ( error.type === 'notFound' && path.length === 1 )
					{
						// This is a normal case: the target does not exist yet,
						// and should be created by the request
						
						rawDocument.parent = {} ;
						
						if ( context.parentNode && context.parentNode.id !== '/' )
						{
							parentCollectionName = context.parentNode.collectionNode.collection.name ;
							rawDocument.parent[ parentCollectionName ] = context.parentNode.id ;
						}
						
						document = self.collection.createDocument( rawDocument , { id: parsedPathNode.identifier } ) ;
						
						// overwrite:true for race conditions?
						document.save( { overwrite: true } , function( error ) {
							if ( error ) { callback( error ) ; return ; }
							callback( undefined , {} , { status: 201 } ) ;
						} ) ;
					}
					else
					{
						// Here this is really an error
						callback( error ) ;
					}
					
					return ;
				}
				
				// The resource exists, overwrite or access should be done by the underlying ObjectNode
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.put(
					path.slice( 1 ) ,
					rawDocument ,
					{ performer: context.performer , parentNode: context.parentNode } ,
					callback
				) ;
			} ) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



CollectionNode.prototype.patch = function collectionNodePatch( path , rawDocument , context , callback )
{
	var self = this ;
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a PATCH on a collection node' } ) ) ;
		return ;
	}
	
	var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				
				if ( error ) { callback( error ) ; return ; }
				
				// The resource exists, overwrite or access should be done by the underlying ObjectNode
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.patch(
					path.slice( 1 ) ,
					rawDocument ,
					{ performer: context.performer , parentNode: context.parentNode } ,
					callback
				) ;
			} ) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



CollectionNode.prototype.delete = function collectionNodeDelete( path , context , callback )
{
	var self = this ;
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a DELETE on a collection node' } ) ) ;
		return ;
	}
	
	var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				
				if ( error ) { callback( error ) ; return ; }
				
				// The resource exists, delete or access should be done by the underlying ObjectNode
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.delete(
					path.slice( 1 ) ,
					{ performer: context.performer , parentNode: context.parentNode } ,
					callback
				) ;
			} ) ;
			
			break ;
			
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



// Probably useless here
/*
// autoSID: the current collection is assumed if an SID is given
CollectionNode.prototype.contains = function contains( name , descriptor , autoSID )
{
	// First check the child name
	var childName = name[ 0 ].toUpperCase() + name.slice( 1 ) ;
	if ( this.children[ childName ] ) { throw new Error( '[restQuery] Cannot attach over an existing child: ' + childName ) ; }
	
	// Then check the descriptor
	if ( ! descriptor || typeof descriptor !== 'object' ) { throw new Error( '[restQuery] the descriptor should be an object.' ) ; }
	if ( ! descriptor.properties || typeof descriptor.properties !== 'object' ) { descriptor.properties = {} ; }
	
	descriptor.properties.SID = { constraint: 'SID' } ;
	descriptor.properties.title = { constraint: 'string' } ;
	
	// Create the collection
	this.children[ childName ] = this.app.world.createCollection( name , descriptor ) ;
	
	//return odm.collection ;
} ;
*/
