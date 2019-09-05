/*
	Rest Query

	Copyright (c) 2014 - 2019 Cédric Ronvel

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

"use strict" ;



const Promise = require( 'seventh' ) ;
const ErrorStatus = require( 'error-status' ) ;
const doormen = require( 'doormen' ) ;
const string = require( 'string-kit' ) ;
const restQuery = require( './restQuery.js' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;



/* Common Node -- shared between ObjectNode & CollectionNode */



function Node( app , children = {} ) {
	this.app = app ;
	this.children = children ;
}

module.exports = Node ;



/*
	Common context object (get/post/put/patch/delete):

		* performer
		* parentNode
		* ancestorObjectNodes
		* query (optional)
*/



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.get = function( pathParts , context = {} ) {
	if ( ! Array.isArray( pathParts ) ) {
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			return Promise.reject( error ) ;
		}
	}

	if ( ! context.output ) { context.output = {} ; }

	context.input = {
		method: 'get' ,
		pathParts: pathParts ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		access: context.access ,
		populateAccess: context.populateAccess ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;

	if ( ! context.input.access ) {
		context.input.access = new Set( [ 'id' , 'content' ] ) ;
	}
	else if ( context.input.access === true || context.input.access === 'all' ) {
		context.input.access = true ;
	}
	else if ( Array.isArray( context.input.access ) ) {
		context.input.access = new Set( context.input.access ) ;
	}
	else {
		context.input.access = new Set( [ context.input.access ] ) ;
	}


	if ( ! context.input.populateAccess ) {
		context.input.populateAccess = context.input.access ;
	}
	else if ( context.input.populateAccess === true || context.input.populateAccess === 'all' ) {
		context.input.populateAccess = true ;
	}
	else if ( Array.isArray( context.input.populateAccess ) ) {
		context.input.populateAccess = new Set( context.input.populateAccess ) ;
	}
	else {
		context.input.populateAccess = new Set( [ context.input.populateAccess ] ) ;
	}

	// 'alter' contains alteration during the traversal, e.g. alteration of the schema... does not survive links.
	context.alter = {} ;

	return this._get( pathParts , context ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.post = function( pathParts , incomingDocument , attachmentStreams , context = {} ) {
	if ( ! Array.isArray( pathParts ) ) {
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			return Promise.reject( error ) ;
		}
	}

	if ( ! context.output ) { context.output = {} ; }

	context.input = {
		method: 'post' ,
		pathParts: pathParts ,
		document: incomingDocument ,
		attachmentStreams: attachmentStreams ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;

	// 'alter' contains alteration during the traversal, e.g. alteration of the schema... does not survive links.
	context.alter = {} ;

	return this._post( pathParts , incomingDocument , attachmentStreams , context ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.put = function( pathParts , incomingDocument , attachmentStreams , context = {} ) {
	if ( ! Array.isArray( pathParts ) ) {
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			return Promise.reject( error ) ;
		}
	}

	if ( ! context.output ) { context.output = {} ; }

	context.input = {
		method: 'put' ,
		pathParts: pathParts ,
		document: incomingDocument ,
		attachmentStreams: attachmentStreams ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;

	// 'alter' contains alteration during the traversal, e.g. alteration of the schema... does not survive links.
	context.alter = {} ;

	return this._put( pathParts , incomingDocument , attachmentStreams , context ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.patch = function( pathParts , incomingDocument , attachmentStreams , context = {} ) {
	// Check empty patch
	if ( ! attachmentStreams ) {
		let empty = true ;

		for ( let k in incomingDocument ) { empty = false ; break ; } // eslint-disable-line no-unused-vars

		if ( empty ) {
			return Promise.resolve( ErrorStatus.badRequest( 'Empty patch' ) ) ;
		}
	}

	if ( ! Array.isArray( pathParts ) ) {
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			return Promise.reject( error ) ;
		}
	}

	if ( ! context.output ) { context.output = {} ; }

	context.input = {
		method: 'patch' ,
		pathParts: pathParts ,
		document: incomingDocument ,
		attachmentStreams: attachmentStreams ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;

	// 'alter' contains alteration during the traversal, e.g. alteration of the schema... does not survive links.
	context.alter = {} ;

	return this._patch( pathParts , incomingDocument , attachmentStreams , context ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.delete = function( pathParts , context = {} ) {
	if ( ! Array.isArray( pathParts ) ) {
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			return Promise.reject( error ) ;
		}
	}

	if ( ! context.output ) { context.output = {} ; }

	context.input = {
		method: 'delete' ,
		pathParts: pathParts ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;

	// 'alter' contains alteration during the traversal, e.g. alteration of the schema... does not survive links.
	context.alter = {} ;

	return this._delete( pathParts , context ) ;
} ;



// autoSlugId: the current collection will be assumed if a slugId is given
Node.prototype.contains = function( collectionNode , autoSlugId ) {
	if ( ! ( collectionNode instanceof restQuery.CollectionNode ) ) { throw new Error( '[restQuery] .constains() require argument #0 to be an instance of restQuery.CollectionNode' ) ; }

	// First check the child name
	if ( this.children[ collectionNode.name ] ) {
		// This is not an error ATM, since contains() is called by the tree, and an element can be in many place of it.
		// So just return, doing nothing.
		//throw new Error( '[restQuery] Cannot attach over an existing child: ' + this.children[ collectionNode.name ] ) ;
		return ;
	}

	this.children[ collectionNode.name ] = collectionNode ;

	//return rootsDb.collection ;
} ;



// It modify a patch, by prefixing each entry
Node.prefixPatchDocument = function( patchDocument , prefix ) {
	var key , prefixed = {} ;

	prefix += '.' ;

	for ( key in patchDocument ) {
		prefixed[ prefix + key ] = patchDocument[ key ] ;
	}

	return prefixed ;
} ;



// Transform common internal errors to user errors, if it is...
Node.transformError =
Node.prototype.transformError = function( error ) {
	if ( error.validatorMessage ) {
		return ErrorStatus.badRequest( {
			message: "Document not validated: " + error.validatorMessage ,
			at: error.at ,
			stack: error.stack
		} ) ;
	}

	return error ;
} ;



Node.transformError =
Node.prototype.transformError = function( error ) {
	if ( error.validatorMessage ) {
		return ErrorStatus.badRequest( {
			message: "Document not validated: " + error.validatorMessage ,
			at: error.at ,
			stack: error.stack
		} ) ;
	}

	return error ;
} ;



Node.doormenThrowingBadRequest =
Node.prototype.doormenThrowingBadRequest = function( schema , data , errorMessage , ... args ) {
	try {
		return doormen( schema , data ) ;
	}
	catch ( error ) {
		if ( args.length ) {
			errorMessage = string.format( errorMessage , ... args ) ;
		}

		throw ErrorStatus.badRequest( {
			message: errorMessage + ' -- ' + error.message ,
			at: error.at ,
			stack: error.stack
		} ) ;
	}
} ;



// Node.checkOneAccess( string , Array , Set )
Node.checkOneAccess = function( accessType , grantedAccess , requiredAccess , requireOnlyOne ) {
	var i , iMax ;

	// This works with booleans
	// true means *ALL* access in both grantedAccess and requiredAccess
	if ( requiredAccess === true ) { return grantedAccess === true ; }

	if ( grantedAccess === true ) { return true ; }
	if ( ! grantedAccess ) { return false ; }
	if ( ! requiredAccess.size ) { return true ; }

	//log.hdebug( "Node.checkOneAccess -- requireOnlyOne %s, grantedAccess %Y, requiredAccess: %Y" , requireOnlyOne , grantedAccess , requiredAccess ) ;

	if ( requireOnlyOne ) {
		for ( i = 0 , iMax = grantedAccess.length ; i < iMax ; i ++ ) {
			if ( requiredAccess.has( grantedAccess[ i ] ) ) { return true ; }
		}
	}
	else {
		for ( i = 0 , iMax = grantedAccess.length ; i < iMax ; i ++ ) {
			if ( requiredAccess.delete( grantedAccess[ i ] ) && ! requiredAccess.size ) { return true ; }
		}
	}

	return false ;
} ;



/*
	Check access on an object.

	params: object where:
		performer: the performing user
		accessType: type of access, e.g.: traverse, read, write, exec, etc...
		requiredAccess: the required access, either a boolean or an array-like of required access-tags
		requireOnlyOne: boolean (optional), if true only one of the requiredAccess is needed (default: false, all tags are required)
		collectionNode: the current CollectionNode or the CollectionNode of the current ObjectNode
		object: the object of the current ObjectNode
		ancestors: a list of ObjectNodes, ordered from the most recent ancestor to the most ancient
*/
Node.checkAccess = async function( params ) {
	var { performer , accessType , requiredAccess , requireOnlyOne , collectionNode , object , forCollection , ancestors } = params ,	/* eslint-disable-line object-curly-newline */
		k , i , iMax , j , jMax , depth , currentObject , ancestorCollectionNode ,
		user , userId , groups , groupId ,
		publicAccess , userAccess , groupAccess ,
		hasUserAccess , hasGroupAccess , hasUserAccessInheritance , hasGroupAccessInheritance ;

	log.debug( "Check access %s %Y" , accessType , requiredAccess ) ;
	//console.log( "object:" , object ) ;
	//console.log( "ancestors:" , ancestors ) ;


	// Access granted: "system" is always right!
	if ( performer.system ) {
		log.debug( 'Granted: "system" is always right' ) ;
		return ;
	}

	if ( ! requiredAccess ) {
		log.debug( 'Granted: no access required' ) ;
		return true ;
	}

	if ( typeof requiredAccess === 'object' ) {
		// We create a fresh Set, because we will remove items each times accesses are granted
		requiredAccess = new Set( requiredAccess ) ;

		if ( ! requiredAccess.size ) {
			log.debug( 'Granted: no access required' ) ;
			return true ;
		}
	}

	// Access granted by 'publicAccess'
	// If it's for a collection but no collection right are found, fallback to the object rights
	if ( forCollection && object.publicAccess.collection && object.publicAccess.collection[ forCollection ] ) {
		publicAccess = forCollection && object.publicAccess.collection && object.publicAccess.collection[ forCollection ] ;
		if ( Node.checkOneAccess( accessType , publicAccess[ accessType ] , requiredAccess , requireOnlyOne ) ) {
			log.debug( "Granted by publicAccess (collection): %J" , object.publicAccess ) ;
			return ;
		}

		// Try inheritance from the objectNode
		publicAccess = object.publicAccess ;
		if (
			publicAccess.inheritance &&
			Node.checkOneAccess( accessType , publicAccess.inheritance[ accessType ] , requiredAccess , requireOnlyOne )
		) {
			log.debug( "Granted by inherited (object inheritance for its own collection) publicAccess: %J" , publicAccess ) ;
			return ;
		}
	}
	else {
		publicAccess = object.publicAccess ;
		if ( Node.checkOneAccess( accessType , publicAccess[ accessType ] , requiredAccess , requireOnlyOne ) ) {
			log.debug( "Granted by publicAccess (object): %J" , object.publicAccess ) ;
			return ;
		}
	}


	// Check if there is at least one userAccess and one groupAccess
	for ( k in object.userAccess ) { hasUserAccess = true ; break ; }
	for ( k in object.groupAccess ) { hasGroupAccess = true ; break ; }


	// Check if some ancestors have inheritance
	for ( i = 0 , iMax = ancestors.length , ancestorCollectionNode = collectionNode ; i < iMax ; ancestorCollectionNode = ancestors[ i ].collectionNode , i ++ ) {
		// Don't forget that ancestors are stored from the most recent to the most ancient
		currentObject = ancestors[ i ].object ;
		depth = i + 1 ;

		// Access granted by inherited collection 'publicAccess'
		if ( currentObject.publicAccess.collection && currentObject.publicAccess.collection[ ancestorCollectionNode.name ] ) {
			publicAccess = currentObject.publicAccess.collection && currentObject.publicAccess.collection[ ancestorCollectionNode.name ] ;

			if (
				publicAccess.inheritance &&
				publicAccess.inheritance.depth >= depth &&
				Node.checkOneAccess( accessType , publicAccess.inheritance[ accessType ] , requiredAccess , requireOnlyOne )
			) {
				log.debug( "Granted by inherited publicAccess (collection): %J" , publicAccess ) ;
				return ;
			}
		}

		// Access granted by inherited object 'publicAccess'
		publicAccess = currentObject.publicAccess ;

		if (
			publicAccess.inheritance &&
			publicAccess.inheritance.depth >= depth &&
			Node.checkOneAccess( accessType , publicAccess.inheritance[ accessType ] , requiredAccess , requireOnlyOne )
		) {
			log.debug( "Granted by inherited publicAccess (object): %J" , publicAccess ) ;
			return ;
		}

		// Search for userAccess inheritance possibilities, before requesting the DB for the current user
		for ( k in currentObject.userAccess ) {
			if ( currentObject.userAccess[ k ].collection && currentObject.userAccess[ k ].collection[ ancestorCollectionNode.name ] ) {
				userAccess = currentObject.userAccess[ k ].collection && currentObject.userAccess[ k ].collection[ ancestorCollectionNode.name ] ;

				if ( userAccess.inheritance && userAccess.inheritance.depth >= depth ) {
					hasUserAccessInheritance = true ;
					break ;
				}
			}

			userAccess = currentObject.userAccess[ k ] ;
			if ( userAccess.inheritance && userAccess.inheritance.depth >= depth ) {
				hasUserAccessInheritance = true ;
				break ;
			}
		}

		// Search for groupAccess inheritance possibilities, before requesting the DB for all groups
		for ( k in currentObject.groupAccess ) {
			if ( currentObject.groupAccess[ k ].collection && currentObject.groupAccess[ k ].collection[ ancestorCollectionNode.name ] ) {
				groupAccess = currentObject.groupAccess[ k ].collection && currentObject.groupAccess[ k ].collection[ ancestorCollectionNode.name ] ;

				if ( groupAccess.inheritance && groupAccess.inheritance.depth >= depth ) {
					hasUserAccessInheritance = true ;
					break ;
				}
			}

			groupAccess = currentObject.groupAccess[ k ] ;
			if ( groupAccess.inheritance && groupAccess.inheritance.depth >= depth ) {
				hasUserAccessInheritance = true ;
				break ;
			}
		}
	}

	// Quickly exit if no particular access exists on this resource
	if ( ! hasUserAccess && ! hasGroupAccess && ! hasUserAccessInheritance && ! hasGroupAccessInheritance ) {
		log.debug( "Denied: no public access, and no user and group access defined: %J" , object.publicAccess ) ;
		throw ErrorStatus.forbidden( "Access forbidden." ) ;
	}


	// ----- USER check -----


	try {
		user = await performer.getUser() ;
	}
	catch ( error ) {
		log.debug( "Denied by performer error: %E" , error ) ;
		throw error ;
	}

	// Access denied, performer should be connected
	if ( ! user ) {
		log.debug( "Denied: no public access and not connected" ) ;
		throw ErrorStatus.unauthorized( "Public access forbidden." ) ;
	}

	userId = user.getId().toString() ;

	// Access granted by 'userAccess'
	if ( userId in object.userAccess ) {
		if ( forCollection && object.userAccess[ userId ].collection && object.userAccess[ userId ].collection[ forCollection ] ) {
			userAccess = forCollection && object.userAccess[ userId ].collection && object.userAccess[ userId ].collection[ forCollection ] ;
			if ( Node.checkOneAccess( accessType , userAccess[ accessType ] , requiredAccess , requireOnlyOne ) ) {
				log.debug( "Granted by userAccess (collection): %J" , object.userAccess[ userId ] ) ;
				return ;
			}

			// Try inheritance from the objectNode
			userAccess = object.userAccess[ userId ] ;
			if (
				userAccess.inheritance &&
				Node.checkOneAccess( accessType , userAccess.inheritance[ accessType ] , requiredAccess , requireOnlyOne )
			) {
				log.debug( "Granted by inherited (object inheritance for its own collection) userAccess: %J" , userAccess ) ;
				return ;
			}
		}
		else {
			userAccess = object.userAccess[ userId ] ;
			if ( Node.checkOneAccess( accessType , userAccess[ accessType ] , requiredAccess , requireOnlyOne ) ) {
				log.debug( "Granted by userAccess (object): %J" , object.userAccess[ userId ] ) ;
				return ;
			}
		}
	}

	// Access granted by inherited 'userAccess'
	if ( hasUserAccessInheritance ) {
		for ( i = 0 , iMax = ancestors.length ; i < iMax ; i ++ ) {
			// Don't forget that ancestors are stored from the most recent to the most ancient
			currentObject = ancestors[ i ].object ;
			depth = i + 1 ;

			if ( ! ( userId in currentObject.userAccess ) ) { continue ; }

			// Access granted by inherited collection 'userAccess'
			if ( currentObject.userAccess[ userId ].collection && currentObject.userAccess[ userId ].collection[ ancestorCollectionNode.name ] ) {
				userAccess = currentObject.userAccess[ userId ].collection && currentObject.userAccess[ userId ].collection[ ancestorCollectionNode.name ] ;
				if (
					userAccess.inheritance &&
					userAccess.inheritance.depth >= depth &&
					Node.checkOneAccess( accessType , userAccess.inheritance[ accessType ] , requiredAccess , requireOnlyOne )
				) {
					log.debug( "Granted by inherited userAccess (collection): %J" , userAccess ) ;
					return ;
				}
			}

			// Access granted by inherited object 'userAccess'
			userAccess = currentObject.userAccess[ userId ] ;
			if (
				userAccess.inheritance &&
				userAccess.inheritance.depth >= depth &&
				Node.checkOneAccess( accessType , userAccess.inheritance[ accessType ] , requiredAccess , requireOnlyOne )
			) {
				log.debug( "Granted by inherited userAccess (object): %J" , userAccess ) ;
				return ;
			}
		}
	}


	// ----- GROUP check -----


	// Quickly exit if no group access exists on this resource
	if ( ! hasGroupAccess && ! hasGroupAccessInheritance ) {
		log.debug( "Denied: no public and user access and no group defined" ) ;
		throw ErrorStatus.forbidden( "Access forbidden." ) ;
	}


	groups = await performer.getGroups() ;
	//log.error( "Groups: %Y" , groups ) ;

	// Check each group of the user
	for ( j = 0 , jMax = groups.length ; j < jMax ; j ++ ) {
		groupId = groups[ j ].getKey() ;
		//console.log( "Checking group: " , groupId ) ;

		// Access granted by 'groupAccess'
		if ( groupId in object.groupAccess ) {
			if ( forCollection && object.groupAccess[ groupId ].collection && object.groupAccess[ groupId ].collection[ forCollection ] ) {
				groupAccess = forCollection && object.groupAccess[ groupId ].collection && object.groupAccess[ groupId ].collection[ forCollection ] ;
				if ( Node.checkOneAccess( accessType , groupAccess[ accessType ] , requiredAccess , requireOnlyOne ) ) {
					log.debug( "Granted by groupAccess (collection): %J" , object.groupAccess[ groupId ] ) ;
					return ;
				}

				// Try inheritance from the objectNode
				groupAccess = object.groupAccess[ groupId ] ;
				if (
					groupAccess.inheritance &&
					Node.checkOneAccess( accessType , groupAccess.inheritance[ accessType ] , requiredAccess , requireOnlyOne )
				) {
					log.debug( "Granted by inherited (object inheritance for its own collection) groupAccess: %J" , groupAccess ) ;
					return ;
				}
			}
			else {
				groupAccess = object.groupAccess[ groupId ] ;
				if ( Node.checkOneAccess( accessType , groupAccess[ accessType ] , requiredAccess , requireOnlyOne ) ) {
					log.debug( "Granted by groupAccess (object): %J" , object.groupAccess[ groupId ] ) ;
					return ;
				}
			}
		}

		// Access granted by inherited 'groupAccess'
		if ( hasGroupAccessInheritance ) {
			for ( i = 0 , iMax = ancestors.length ; i < iMax ; i ++ ) {
				// Don't forget that ancestors are stored from the most recent to the most ancient
				currentObject = ancestors[ i ].object ;
				depth = i + 1 ;

				if ( ! ( groupId in currentObject.groupAccess ) ) { continue ; }

				// Access granted by inherited collection 'groupAccess'
				if ( currentObject.groupAccess[ groupId ].collection && currentObject.groupAccess[ groupId ].collection[ ancestorCollectionNode.name ] ) {
					groupAccess = currentObject.groupAccess[ groupId ].collection && currentObject.groupAccess[ groupId ].collection[ ancestorCollectionNode.name ] ;

					if (
						groupAccess.inheritance &&
						groupAccess.inheritance.depth >= depth &&
						Node.checkOneAccess( accessType , groupAccess.inheritance[ accessType ] , requiredAccess , requireOnlyOne )
					) {
						log.debug( "Granted by inherited groupAccess (collection): %J" , groupAccess ) ;
						return ;
					}
				}

				// Access granted by inherited object 'groupAccess'
				groupAccess = currentObject.groupAccess[ groupId ] ;
				if (
					groupAccess.inheritance &&
					groupAccess.inheritance.depth >= depth &&
					Node.checkOneAccess( accessType , groupAccess.inheritance[ accessType ] , requiredAccess , requireOnlyOne )
				) {
					log.debug( "Granted by inherited groupAccess (object): %J" , groupAccess ) ;
					return ;
				}
			}
		}
	}


	// Nothing has granted access to this connected performer, so access is denied
	log.debug( "Denied: all potential grant sources have been exhausted without success" ) ;
	throw ErrorStatus.forbidden( "Access forbidden." ) ;
} ;



// Check access to tags on an object
//Node.getAllAccessTags = async function( performer , accessType , collectionNode , object , ancestors ) {
Node.getAllAccessTags = async function( params ) {
	var { performer , accessType , collectionNode , object , forCollection , ancestors } = params ,
		k , i , iMax , j , jMax , depth , currentObject , ancestorCollectionNode ,
		user , userId , groups , groupId ,
		publicAccess , userAccess , groupAccess ,
		accessTags = new Set() ,
		hasUserAccess , hasGroupAccess , hasUserAccessInheritance , hasGroupAccessInheritance ;

	log.debug( "Get all access tags %s" , accessType ) ;
	//console.log( "object:" , object ) ;
	//console.log( "ancestors:" , ancestors ) ;


	// Access granted: "system" is always right!
	if ( performer.system ) {
		log.debug( 'Get all access -- granted: "system" is always right' ) ;
		return true ;
	}


	// Access granted by 'publicAccess'
	if ( forCollection && object.publicAccess.collection && object.publicAccess.collection[ forCollection ] ) {
		publicAccess = forCollection && object.publicAccess.collection && object.publicAccess.collection[ forCollection ] ;
		if ( publicAccess[ accessType ] ) {
			// All right granted?
			if ( publicAccess[ accessType ] === true ) { return true ; }
			publicAccess[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
			log.debug( "After publicAccess (collection): %J" , accessTags ) ;
		}

		// Try inheritance from the objectNode
		publicAccess = object.publicAccess ;
		if ( publicAccess.inheritance && publicAccess.inheritance[ accessType ] ) {
			// All right granted?
			if ( publicAccess.inheritance[ accessType ] === true ) { return true ; }
			publicAccess.inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
			log.debug( "After publicAccess inheritance (object inheritance for its own collection): %J" , accessTags ) ;
			return ;
		}
	}
	else {
		publicAccess = object.publicAccess ;
		if ( publicAccess[ accessType ] ) {
			// All right granted?
			if ( publicAccess[ accessType ] === true ) { return true ; }
			publicAccess[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
			log.debug( "After publicAccess (object): %J" , accessTags ) ;
		}
	}


	// Check if there is at least one userAccess and one groupAccess
	for ( k in object.userAccess ) { hasUserAccess = true ; break ; }
	for ( k in object.groupAccess ) { hasGroupAccess = true ; break ; }


	// Check if some ancestors have inheritance
	//for ( i = 0 , iMax = ancestors.length ; i < iMax ; i ++ ) {
	for ( i = 0 , iMax = ancestors.length , ancestorCollectionNode = collectionNode ; i < iMax ; ancestorCollectionNode = ancestors[ i ].collectionNode , i ++ ) {
		// Don't forget that ancestors are stored from the most recent to the most ancient
		currentObject = ancestors[ i ].object ;
		depth = i + 1 ;

		// Access granted by inherited collection 'publicAccess'
		if ( currentObject.publicAccess.collection && currentObject.publicAccess.collection[ ancestorCollectionNode.name ] ) {
			publicAccess = currentObject.publicAccess.collection && currentObject.publicAccess.collection[ ancestorCollectionNode.name ] ;
			if ( publicAccess.inheritance && publicAccess.inheritance.depth >= depth ) {
				if ( publicAccess.inheritance[ accessType ] === true ) { return true ; }
				publicAccess.inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
				log.debug( "After inherited publicAccess (collection): %J" , accessTags ) ;
			}
		}

		// Access granted by inherited object 'publicAccess'
		publicAccess = currentObject.publicAccess ;
		if ( publicAccess.inheritance && publicAccess.inheritance.depth >= depth ) {
			if ( publicAccess.inheritance[ accessType ] === true ) { return true ; }
			publicAccess.inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
			log.debug( "After inherited publicAccess (object): %J" , accessTags ) ;
		}

		// Search for userAccess inheritance possibilities, before requesting the DB for the current user
		for ( k in currentObject.userAccess ) {
			if ( currentObject.userAccess[ k ].collection && currentObject.userAccess[ k ].collection[ ancestorCollectionNode.name ] ) {
				userAccess = currentObject.userAccess[ k ].collection && currentObject.userAccess[ k ].collection[ ancestorCollectionNode.name ] ;

				if ( userAccess.inheritance && userAccess.inheritance.depth >= depth ) {
					hasUserAccessInheritance = true ;
					break ;
				}
			}

			userAccess = currentObject.userAccess[ k ] ;
			if ( userAccess.inheritance && userAccess.inheritance.depth >= depth ) {
				hasUserAccessInheritance = true ;
				break ;
			}
		}

		// Search for groupAccess inheritance possibilities, before requesting the DB for all groups
		for ( k in currentObject.groupAccess ) {
			if ( currentObject.groupAccess[ k ].collection && currentObject.groupAccess[ k ].collection[ ancestorCollectionNode.name ] ) {
				groupAccess = currentObject.groupAccess[ k ].collection && currentObject.groupAccess[ k ].collection[ ancestorCollectionNode.name ] ;

				if ( groupAccess.inheritance && groupAccess.inheritance.depth >= depth ) {
					hasUserAccessInheritance = true ;
					break ;
				}
			}

			groupAccess = currentObject.groupAccess[ k ] ;
			if ( groupAccess.inheritance && groupAccess.inheritance.depth >= depth ) {
				hasUserAccessInheritance = true ;
				break ;
			}
		}
	}

	// Quickly exit if no particular access exists on this resource
	if ( ! hasUserAccess && ! hasGroupAccess && ! hasUserAccessInheritance && ! hasGroupAccessInheritance ) {
		return accessTags ;
	}


	// ----- USER check -----


	try {
		user = await performer.getUser() ;
	}
	catch ( error ) {
		log.debug( "Denied by performer error: %E" , error ) ;
		//throw error ;
		return accessTags ;
	}

	// No further access, performer should be connected
	if ( ! user ) { return accessTags ; }

	userId = user.getId().toString() ;

	// Access granted by 'userAccess'
	if ( userId in object.userAccess ) {
		if ( forCollection && object.userAccess[ userId ].collection && object.userAccess[ userId ].collection[ forCollection ] ) {
			userAccess = forCollection && object.userAccess[ userId ].collection && object.userAccess[ userId ].collection[ forCollection ] ;
			if ( userAccess[ accessType ] ) {
				if ( userAccess[ accessType ] === true ) { return true ; }
				userAccess[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
				log.debug( "After userAccess (collection): %J" , accessTags ) ;
			}

			// Try inheritance from the objectNode
			userAccess = object.userAccess[ userId ] ;
			if ( userAccess.inheritance && userAccess.inheritance[ accessType ] ) {
				if ( userAccess.inheritance[ accessType ] === true ) { return true ; }
				userAccess.inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
				log.debug( "After userAccess (object inheritance for its own collection): %J" , accessTags ) ;
			}
		}
		else {
			userAccess = object.userAccess[ userId ] ;
			if ( userAccess[ accessType ] ) {
				if ( userAccess[ accessType ] === true ) { return true ; }
				userAccess[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
				log.debug( "After userAccess (object): %J" , accessTags ) ;
			}
		}
	}

	// Access granted by inherited 'userAccess'
	if ( hasUserAccessInheritance ) {
		for ( i = 0 , iMax = ancestors.length ; i < iMax ; i ++ ) {
			// Don't forget that ancestors are stored from the most recent to the most ancient
			currentObject = ancestors[ i ].object ;
			depth = i + 1 ;

			if ( ! ( userId in currentObject.userAccess ) ) { continue ; }

			// Access granted by inherited collection 'userAccess'
			if ( currentObject.userAccess[ userId ].collection && currentObject.userAccess[ userId ].collection[ ancestorCollectionNode.name ] ) {
				userAccess = currentObject.userAccess[ userId ].collection && currentObject.userAccess[ userId ].collection[ ancestorCollectionNode.name ] ;
				if ( userAccess.inheritance && userAccess.inheritance.depth >= depth && userAccess.inheritance[ accessType ] ) {
					if ( userAccess.inheritance[ accessType ] === true ) { return true ; }
					userAccess.inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
					log.debug( "After inherited userAccess (collection): %J" , accessTags ) ;
				}
			}

			// Access granted by inherited object 'userAccess'
			userAccess = currentObject.userAccess[ userId ] ;
			if ( userAccess.inheritance && userAccess.inheritance.depth >= depth && userAccess.inheritance[ accessType ] ) {
				if ( userAccess.inheritance[ accessType ] === true ) { return true ; }
				userAccess.inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
				log.debug( "After inherited userAccess (object): %J" , accessTags ) ;
			}
		}
	}


	// ----- GROUP check -----


	// Quickly exit if no group access exist on this resource
	if ( ! hasGroupAccess && ! hasGroupAccessInheritance ) { return accessTags ; }


	groups = await performer.getGroups() ;
	//log.error( "Groups: %Y" , groups ) ;

	// Check each group of the user
	for ( j = 0 , jMax = groups.length ; j < jMax ; j ++ ) {
		groupId = groups[ j ].getKey() ;
		//console.log( "Checking group: " , groupId ) ;

		// Access granted by 'groupAccess'
		if ( groupId in object.groupAccess ) {
			if ( forCollection && object.groupAccess[ groupId ].collection && object.groupAccess[ groupId ].collection[ forCollection ] ) {
				groupAccess = forCollection && object.groupAccess[ groupId ].collection && object.groupAccess[ groupId ].collection[ forCollection ] ;
				if ( groupAccess[ accessType ] ) {
					if ( groupAccess[ accessType ] === true ) { return true ; }
					groupAccess[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
					log.debug( "After groupAccess (collection): %J" , accessTags ) ;
				}

				// Try inheritance from the objectNode
				groupAccess = object.groupAccess[ groupId ] ;
				if ( groupAccess.inheritance[ accessType ] ) {
					if ( groupAccess.inheritance[ accessType ] === true ) { return true ; }
					groupAccess.inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
					log.debug( "After groupAccess (object inheritance for its own collection): %J" , accessTags ) ;
				}
			}
			else {
				groupAccess = object.groupAccess[ groupId ] ;
				if ( groupAccess[ accessType ] ) {
					if ( groupAccess[ accessType ] === true ) { return true ; }
					groupAccess[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
					log.debug( "After groupAccess (object): %J" , accessTags ) ;
				}
			}
		}

		// Access granted by inherited 'groupAccess'
		if ( hasGroupAccessInheritance ) {
			for ( i = 0 , iMax = ancestors.length ; i < iMax ; i ++ ) {
				// Don't forget that ancestors are stored from the most recent to the most ancient
				currentObject = ancestors[ i ].object ;
				depth = i + 1 ;

				if ( ! ( groupId in currentObject.groupAccess ) ) { continue ; }

				if ( currentObject.groupAccess[ groupId ].collection && currentObject.groupAccess[ groupId ].collection[ ancestorCollectionNode.name ] ) {
					groupAccess = currentObject.groupAccess[ groupId ].collection && currentObject.groupAccess[ groupId ].collection[ ancestorCollectionNode.name ] ;

					// Access granted by inherited 'groupAccess'
					if ( groupAccess.inheritance && groupAccess.inheritance.depth >= depth && groupAccess.inheritance[ accessType ] ) {
						if ( groupAccess.inheritance[ accessType ] === true ) { return true ; }
						groupAccess.inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
						log.debug( "After inherited groupAccess (collection): %J" , accessTags ) ;
					}
				}

				groupAccess = currentObject.groupAccess[ groupId ] ;
				if ( groupAccess.inheritance && groupAccess.inheritance.depth >= depth && groupAccess.inheritance[ accessType ] ) {
					if ( groupAccess.inheritance[ accessType ] === true ) { return true ; }
					groupAccess.inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
					log.debug( "After inherited groupAccess (object): %J" , accessTags ) ;
				}
			}
		}
	}

	return accessTags ;
} ;

