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



// WIP... Some parts are copy of odm-kit collection schema...

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
		defaultInheritAccess: { type: 'restQuery.inheritAccess' , default: 'none' },
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
		
		schema.properties.title = { type: 'string' } ;
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
	
	schema.properties.otherAccess = { type: 'restQuery.accessLevel' , default: restQuery.accessLevel.READ } ;
	
	schema.properties.inheritAccess = { type: 'restQuery.inheritAccess' , default: schema.defaultInheritAccess } ;
	
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
		validate: { value: collection.validate }
	} ) ;
	
	// Add the collection to the app
	app.collectionNodes[ name ] = collectionNode ;
	
	return collectionNode ;
} ;



// Here we create an ObjectNode of part of the current CollectionNode
CollectionNode.prototype.createObjectNode = function createObjectNode( object , objectNode )
{
	return restQuery.ObjectNode.create( this.app , this , object , objectNode ) ;
} ;



CollectionNode.prototype.get = function collectionNodeGet( path , context , callback )
{
	var self = this ;
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// /!\ Is this checkAccess() useful? /!\
		//this.checkAccess( context , restQuery.accessLevel.PASS_THROUGH , undefined , function( error ) {
		
		self.collection.collect( { "parent.id": context.parentNode.id } , function( error , batch ) {
			
			var i , newContext , rawBatch = [] ;
			
			if ( error ) { callback( error ) ; return ; }
			
			newContext = { performer: context.performer , parentNode: context.parentNode } ;
			
			async.foreach( batch.documents , function( element , callback ) {
				
				restQuery.Node.checkAccess( {
						access: restQuery.accessLevel.READ ,
						object: element.$ ,
						ancestorObjectNodes: context.ancestorObjectNodes ,
						performer: context.performer
					} ,
					function( error ) {
						
						if ( ! error )
						{
							//console.log( require('string-kit').inspect( { style: 'color' } , element ) ) ;
							rawBatch.push( element.export() ) ;
						}
						
						callback() ;
				} ) ;
			} )
			.exec( function( error ) {
				callback( undefined , rawBatch , {} ) ;
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
			this.collection.getUnique( { _id: parsedPathNode.identifier , "parent.id": context.parentNode.id } , function( error , document ) {
				
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
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



CollectionNode.prototype.post = function collectionNodePost( path , rawDocument , context , callback )
{
	var self = this , document , id ;
	
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		//self.checkAccess( context , restQuery.accessLevel.READ_CREATE , undefined , function( error ) {
		restQuery.Node.checkAccess( {
				access: restQuery.accessLevel.READ_CREATE ,
				object: context.parentNode.object.$ || context.parentNode.object ,
				ancestorObjectNodes: context.ancestorObjectNodes ,
				performer: context.performer
			} ,
			function( error ) {
				
				if ( error ) { callback( error ) ; return ; }
				
				rawDocument.parent = {
					collection: context.parentNode.collectionNode && context.parentNode.collectionNode.name ,
					id: context.parentNode.id
				} ;
				
				id = self.collection.createId( rawDocument ) ;
				
				try {
					document = self.collection.createDocument( rawDocument ) ;
				}
				catch ( error ) {
					if ( error.validatorMessage )
					{
						console.log( rawDocument.parent ) ;
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
				document.save( { overwrite: true } , function( error ) {
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
			this.collection.getUnique( { _id: parsedPathNode.identifier , "parent.id": context.parentNode.id } , function( error , document ) {
				
				if ( error ) { callback( error ) ; }
				
				// The resource exists, overwrite or access should be done by the underlying ObjectNode
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.post(
					path.slice( 1 ) ,
					rawDocument ,
					{
						performer: context.performer ,
						parentNode: context.parentNode ,
						ancestorObjectNodes: context.ancestorObjectNodes
					} ,
					callback
				) ;
			} ) ;
			break ;
			
		case 'member' :
			if ( ! this.methods[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Method '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.methods[ parsedPathNode.identifier ]( path , rawDocument , context , callback ) ;
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



CollectionNode.prototype.put = function collectionNodePut( path , rawDocument , context , callback )
{
	var self = this ;
	
	
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
			// We cannot use collection.getUnique here, because of the ambigous PUT method (create or overwrite)
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				
				if ( error )
				{
					if ( error.type === 'notFound' && path.length === 1 )
					{
						// This is a normal case: the target does not exist yet,
						// and should be created by the request
						
						//self.checkAccess( context , restQuery.accessLevel.READ_CREATE , undefined , function( error ) {
						restQuery.Node.checkAccess( {
								access: restQuery.accessLevel.READ_CREATE ,
								object: context.parentNode.object.$ || context.parentNode.object ,
								ancestorObjectNodes: context.ancestorObjectNodes ,
								performer: context.performer
							} ,
							function( error ) {
								
								if ( error ) { callback( error ) ; return ; }
								
								rawDocument.parent = {
									collection: context.parentNode.collectionNode && context.parentNode.collectionNode.name ,
									id: context.parentNode.id
								} ;
								
								try {
									document = self.collection.createDocument( rawDocument , { id: parsedPathNode.identifier } ) ;
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
								document.save( { overwrite: true } , function( error ) {
									if ( error ) { callback( error ) ; return ; }
									callback( undefined , {} , { status: 201 } ) ;
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
				
				if ( document.$.parent.id.toString() !== context.parentNode.id.toString() )
				{
					callback( ErrorStatus.badRequest( { message: 'Ambigous PUT request: this ID exists but is the child of another parent.' } ) ) ;
					return ;
				}
				
				// The resource exists, overwrite or access should be done by the underlying ObjectNode
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.put(
					path.slice( 1 ) ,
					rawDocument ,
					{
						performer: context.performer ,
						parentNode: context.parentNode ,
						ancestorObjectNodes: context.ancestorObjectNodes
					} ,
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
			this.collection.getUnique( { _id: parsedPathNode.identifier , "parent.id": context.parentNode.id } , function( error , document ) {
				
				if ( error ) { callback( error ) ; return ; }
				
				// The resource exists, overwrite or access should be done by the underlying ObjectNode
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.patch(
					path.slice( 1 ) ,
					rawDocument ,
					{
						performer: context.performer ,
						parentNode: context.parentNode ,
						ancestorObjectNodes: context.ancestorObjectNodes
					} ,
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
			this.collection.getUnique( { _id: parsedPathNode.identifier , "parent.id": context.parentNode.id } , function( error , document ) {
				
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
			
			break ;
			
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



// Probably useless here
/*
// autoSlugId: the current collection is assumed if a slugId is given
CollectionNode.prototype.contains = function contains( name , schema , autoSlugId )
{
	// First check the child name
	var childName = name[ 0 ].toUpperCase() + name.slice( 1 ) ;
	if ( this.children[ childName ] ) { throw new Error( '[restQuery] Cannot attach over an existing child: ' + childName ) ; }
	
	// Then check the schema
	if ( ! schema || typeof schema !== 'object' ) { throw new Error( '[restQuery] the schema should be an object.' ) ; }
	if ( ! schema.properties || typeof schema.properties !== 'object' ) { schema.properties = {} ; }
	
	schema.properties.slugId = { constraint: 'slugId' } ;
	schema.properties.title = { constraint: 'string' } ;
	
	// Create the collection
	this.children[ childName ] = this.app.world.createCollection( name , schema ) ;
	
	//return odm.collection ;
} ;
*/
