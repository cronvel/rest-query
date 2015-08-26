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
var doormen = require( 'doormen' ) ;
var async = require( 'async-kit' ) ;

var restQuery = require( './restQuery.js' ) ;





			/* CollectionNode */



function CollectionNode() { throw new Error( '[restQuery] Cannot create a CollectionNode object directly' ) ; }
module.exports = CollectionNode ;

CollectionNode.prototype = Object.create( restQuery.Node.prototype ) ;
CollectionNode.prototype.constructor = CollectionNode ;



// WIP... Some parts are copy of roots-db collection schema...

var collectionHookSchema = {
	type: 'array',
	sanitize: 'toArray',
	of: { type: 'function' }
} ;



CollectionNode.schema = {
	type: 'strictObject',
	extraProperties: true,
	properties: {
		properties: {
			type: 'strictObject',
			default: {}
		},
		defaultAccessLevel: { type: 'restQuery.accessLevel' , default: 'read' },
		defaultInheritAccess: { type: 'restQuery.inheritAccess' , default: 'none' },
		slugGenerationProperty: { type: 'string' , default: null },
		slugGenerationOptions: { type: 'strictObject' , default: {} },
		shortcutCollection: { type: 'string' , default: null },
		hooks: {
			type: 'strictObject',
			default: {
				beforeCreateDocument: [],
				afterCreateDocument: []
			},
			extraProperties: true,
			properties: {
				beforeCreateDocument: collectionHookSchema,
				afterCreateDocument: collectionHookSchema
			}
		}
	}
} ;



CollectionNode.create = function createCollectionNode( app , name , schema , collectionNode )
{
	if ( ! collectionNode ) { collectionNode = Object.create( restQuery.CollectionNode.prototype ) ; }
	
	// Do not apply on derivative of CollectionNode, they should define their own defaults
	if ( collectionNode.__proto__.constructor === restQuery.CollectionNode )	// jshint ignore:line
	{
		doormen( CollectionNode.schema , schema ) ;
	}
	
	schema.properties.slugId = { type: 'restQuery.slug' , sanitize: 'restQuery.randomSlug' } ;
	
	// force the creation of the 'parent' property
	schema.properties.parent = {
		type: 'strictObject' ,
		default: { id: '/', collection: null } ,
		properties: {
			id: { default: '/', type: 'restQuery.id' } ,
			collection: { default: null, type: 'string' }
		}
	} ;
	
	// force the creation of the '*Access' property
	schema.properties.userAccess = {
		type: 'strictObject' ,
		default: {} ,
		keys: { type: 'restQuery.id' } ,
		of: { type: 'restQuery.accessLevel' }
	} ;
	
	schema.properties.groupAccess = {
		type: 'strictObject' ,
		default: {} ,
		keys: { type: 'restQuery.id' } ,
		of: { type: 'restQuery.accessLevel' }
	} ;
	
	schema.properties.otherAccess = { type: 'restQuery.accessLevel' , default: schema.defaultAccessLevel } ;
	
	schema.properties.inheritAccess = { type: 'restQuery.inheritAccess' , default: schema.defaultInheritAccess } ;
	
	schema.hooks.beforeCreateDocument.push( CollectionNode.prototype.beforeCreateDocumentHook.bind( collectionNode ) ) ;
	
	schema.indexes.push( { properties: { slugId: 1 , "parent.id": 1 } , unique: true } ) ; //, driver: { sparse: true } } ) ;
	
	
	// Call the parent constructor
	restQuery.Node.create( app , collectionNode ) ;
	
	// First check the child name
	//var restQueryName = name[ 0 ].toUpperCase() + name.slice( 1 ) ;
	var restQueryName = name[ 0 ].toLowerCase() + name.slice( 1 ) ;
	
	// Create the ODM collection
	//console.log( '\nBefore createCollection() schema:' , schema ) ;
	var collection = app.world.createCollection( name , schema ) ;
	
	Object.defineProperties( collectionNode , {
		name: { value: restQueryName , enumerable: true } ,
		collection: { value: collection , enumerable: true } ,
		methods: { value: {} , enumerable: true } ,
		validate: { value: collection.validate } ,
		slugGenerationProperty: { value: schema.slugGenerationProperty , enumerable: true } ,
		slugGenerationOptions: { value: schema.slugGenerationOptions , enumerable: true } ,
		shortcutCollection: { value: schema.shortcutCollection , enumerable: true }
	} ) ;
	
	// Add the collection to the app
	app.collectionNodes[ name ] = collectionNode ;
	
	return collectionNode ;
} ;



CollectionNode.prototype.beforeCreateDocumentHook = function beforeCreateDocumentHook( incomingDocument )
{
	if ( ! incomingDocument.slugId && this.slugGenerationProperty &&
		typeof incomingDocument[ this.slugGenerationProperty ] === 'string' &&
		incomingDocument[ this.slugGenerationProperty ].length >= 1 )
	{
		incomingDocument.slugId = restQuery.slugify( incomingDocument[ this.slugGenerationProperty ] , this.slugGenerationOptions ) ;
	}
	
	return incomingDocument ;
} ;



// Here we create an ObjectNode of part of the current CollectionNode
CollectionNode.prototype.createObjectNode = function createObjectNode( object , objectNode )
{
	return restQuery.ObjectNode.create( this.app , this , object , objectNode ) ;
} ;



CollectionNode.prototype.get = function collectionNodeGet( path , context , callback )
{
	var self = this , fingerprint ;
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		self.collection.collect( { "parent.id": context.parentNode.id } , function( error , batch ) {
			
			var i , newContext , filteredBatch = [] ;
			
			if ( error ) { callback( error ) ; return ; }
			
			newContext = { performer: context.performer , parentNode: context.parentNode } ;
			
			async.foreach( batch , function( element , callback ) {
				
				restQuery.Node.checkAccess( {
						access: 'read' ,
						object: element ,
						ancestorObjectNodes: context.ancestorObjectNodes ,
						performer: context.performer
					} ,
					function( error ) {
						
						if ( ! error )
						{
							//console.log( require('string-kit').inspect( { style: 'color' } , element ) ) ;
							filteredBatch.push( element ) ;
						}
						
						callback() ;
				} ) ;
			} )
			.exec( function( error ) {
				callback( undefined , filteredBatch , {} ) ;
			} ) ;
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
			fingerprint = { $id: parsedPathNode.identifier , "parent.id": context.parentNode.id } ;
			break ;
			
		case 'slugId' :
			fingerprint = { slugId: parsedPathNode.identifier , "parent.id": context.parentNode.id } ;
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( fingerprint , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		// we instanciate an objectNode to query
		var objectNode = self.createObjectNode( document ) ;
		
		objectNode.get(
			path.slice( 1 ) ,
			{
				performer: context.performer ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ,
			callback
		) ;
	} ) ;
} ;



CollectionNode.prototype.post = function collectionNodePost( path , incomingDocument , context , callback )
{
	var self = this , id , fingerprint ;
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		restQuery.Node.checkAccess( {
				access: 'readCreate' ,
				object: context.parentNode.object ,
				ancestorObjectNodes: context.ancestorObjectNodes ,
				performer: context.performer
			} ,
			function( error ) {
				
				if ( error ) { callback( error ) ; return ; }
				
				incomingDocument.parent = {
					collection: context.parentNode.collectionNode && context.parentNode.collectionNode.name ,
					id: context.parentNode.id
				} ;
				
				id = incomingDocument.$id = self.collection.createId( incomingDocument ) ;
				
				try {
					self.collection.createDocument( incomingDocument ) ;
				}
				catch ( error ) {
					if ( error.validatorMessage )
					{
						//console.log( incomingDocument.parent ) ;
						callback( ErrorStatus.badRequest(
							{
								message: "Document not validated: " + error.validatorMessage ,
								stack: error.stack
							}
						) ) ;
					}
					else
					{
						callback( ErrorStatus.badRequest( { message: error.toString() } ) ) ;
					}
					return ;
				}
				
				// overwrite:true for race conditions?
				incomingDocument.$.save( { overwrite: true } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					
					callback( undefined , { id: id } , { status: 201 } ) ;
				} ) ;
			}
		) ;
		
		return ;
	}
	
	var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			fingerprint = { $id: parsedPathNode.identifier , "parent.id": context.parentNode.id } ;
			break ;
			
		case 'slugId' :
			fingerprint = { slugId: parsedPathNode.identifier , "parent.id": context.parentNode.id } ;
			break ;
			
		case 'member' :
			if ( ! this.methods[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Method '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.methods[ parsedPathNode.identifier ]( path , incomingDocument , context , callback ) ;
			return ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( fingerprint , function( error , document ) {
		
		if ( error ) { callback( error ) ; }
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document ) ;
		
		objectNode.post(
			path.slice( 1 ) ,
			incomingDocument ,
			{
				performer: context.performer ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ,
			callback
		) ;
	} ) ;
} ;



CollectionNode.prototype.put = function collectionNodePut( path , incomingDocument , context , callback )
{
	var self = this , id , slugMode ;
	
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
	
	
	
	// /!\ Refacto here: move that out of the main function /!\
	
	var put = function put( error , document ) {
		
		if ( error )
		{
			if ( error.type === 'notFound' && path.length === 1 )
			{
				// This is a normal case: the target does not exist yet,
				// and should be created by the request
				
				restQuery.Node.checkAccess( {
						access: 'readCreate' ,
						object: context.parentNode.object ,
						ancestorObjectNodes: context.ancestorObjectNodes ,
						performer: context.performer
					} ,
					function( error ) {
						
						if ( error ) { callback( error ) ; return ; }
						
						incomingDocument.parent = {
							collection: context.parentNode.collectionNode && context.parentNode.collectionNode.name ,
							id: context.parentNode.id
						} ;
						
						if ( slugMode )
						{
							id = incomingDocument.$id = self.collection.createId( incomingDocument ) ;
							incomingDocument.slugId = parsedPathNode.identifier ;
						}
						else
						{
							id = incomingDocument.$id = parsedPathNode.identifier ;
						}
						
						try {
							self.collection.createDocument( incomingDocument ) ;
						}
						catch ( error ) {
							if ( error.validatorMessage )
							{
								callback( ErrorStatus.badRequest(
									{
										message: "Document not validated: " + error.validatorMessage ,
										stack: error.stack
									}
								) ) ;
							}
							else
							{
								callback( ErrorStatus.badRequest( { message: error.toString() } ) ) ;
							}
							return ;
						}
						
						// overwrite:true for race conditions?
						incomingDocument.$.save( { overwrite: true } , function( error ) {
							if ( error ) { callback( error ) ; return ; }
							callback( undefined , { id: id } , { status: 201 } ) ;
						} ) ;
					}
				) ;
			}
			else
			{
				// Here this is really an error
				callback( error ) ;
			}
			
			return ;
		}
		
		if ( document.parent.id.toString() !== context.parentNode.id.toString() )
		{
			callback( ErrorStatus.badRequest( { message: 'Ambigous PUT request: this ID exists but is the child of another parent.' } ) ) ;
			return ;
		}
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document ) ;
		
		objectNode.put(
			path.slice( 1 ) ,
			incomingDocument ,
			{
				performer: context.performer ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ,
			callback
		) ;
	} ;
	
	
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			// We cannot use collection.getUnique here, because of the ambigous PUT method (create or overwrite)
			this.collection.get( parsedPathNode.identifier , put ) ;
			return ;
		
		case 'slugId' :
			slugMode = true ;
			this.collection.getUnique( { slugId: parsedPathNode.identifier , "parent.id": context.parentNode.id } , put ) ;
			return ;
			
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			return ;
	}
} ;



CollectionNode.prototype.patch = function collectionNodePatch( path , incomingDocument , context , callback )
{
	var self = this , fingerprint ;
	
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
			fingerprint = { $id: parsedPathNode.identifier , "parent.id": context.parentNode.id } ;
			break ;
			
		case 'slugId' :
			fingerprint = { slugId: parsedPathNode.identifier , "parent.id": context.parentNode.id } ;
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( fingerprint , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document ) ;
		
		objectNode.patch(
			path.slice( 1 ) ,
			incomingDocument ,
			{
				performer: context.performer ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ,
			callback
		) ;
	} ) ;
} ;



CollectionNode.prototype.delete = function collectionNodeDelete( path , context , callback )
{
	var self = this , fingerprint ;
	
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
			fingerprint = { $id: parsedPathNode.identifier , "parent.id": context.parentNode.id } ;
			break ;
			
		case 'slugId' :
			fingerprint = { slugId: parsedPathNode.identifier , "parent.id": context.parentNode.id } ;
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( fingerprint , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		// The resource exists, delete or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document ) ;
		
		objectNode.delete(
			path.slice( 1 ) ,
			{
				performer: context.performer ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ,
			callback
		) ;
	} ) ;
	
} ;



