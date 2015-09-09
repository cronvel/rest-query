


User scope
==========

Login of users of the user-centric model:
POST /Users/CREATE-TOKEN

Login of users of the company-centric model:
POST /Boards/Users/CREATE-TOKEN
POST /Whatever/Users/CREATE-TOKEN

Typically, a user belong to a parent.
Global users belong to root (i.e. '/').
Users restricted to a container belong to it:

### They can't operate outside of their parent! ###



Authorization's levels
======================

"none": no access
"passThrough": access/pass-through (give access to the children but not on data of the current resource)
"partialRead": partial-read (some parts of the data is hidden)
"read": read
"readCreate": read, create
"readCreateModify": read, create, modify
"all": read, create, modify, delete, move (if 'create' allowed on target)

? read, create, modify, modify access ?



Resource-based authorization
============================

Resource's schema: {
	defaultInheritAccess: none|all|max|min
}

Resource: {
	inheritAccess: none|all|max|min,
	
	userAccess: {
		ID1: level,
		ID2: level,
		...
	},
	groupAccess: {
		ID1: level,
		ID2: level,
		...
	},
	otherAccess: level,
	
	childCollectionAccess: {
		<collectionId1>: {
			userAccess: {
				ID1: level,
				ID2: level,
				...
			},
			groupAccess: {
				ID1: level,
				ID2: level,
				...
			},
			otherAccess: level,
		
		<collectionId2>: {
			userAccess: {
				ID1: level,
				ID2: level,
				...
			},
			groupAccess: {
				ID1: level,
				ID2: level,
				...
			},
			otherAccess: level,
	}
}



Authorization inheritance
=========================

* none: the parent authorization's level is ignored, the authorization's level of the current resource is computed,
	and will be passed to eventual children
* all: no authorization is computed for the resource, instead the authorization of the parent is used, and will be passed to
	eventual children.
	### This is faster, especially for collections. ###
* max: the authorization's level of the current resource is computed, the greater level between the current resource and the
	parent one will be used and passed to eventual children. Access can only grow in this model.
* min: the authorization's level of the current resource is computed, the lesser level between the current resource and the
	parent one will be used and passed to eventual children. Access can only lower in this model.



Resource-level authorization resolution
=======================================

On a particular resource, the best level available is used.
There is no need to compute the REAL level.

If a particular request needs only the 'read' (GET), once a level that have read is found, others are not explored.

* 'othersAccess' is checked, if it is sufficient the access is GRANTED
* ELSE 'usersAccess' is checked, if it contains the user's ID and the level is sufficient, the access is GRANTED
* ELSE 'groupsAccess' is checked, each group common to the resource and the user are are checked, if one of them is sufficient,
	the access is GRANTED
* ELSE the access is DENIED

For each resource, ONLY THE RESOURCE AND THE USER IS NEEDED TO SOLVE AUTHORIZATION.

The user contains (as a cache) all groups it belongs to.


User: {
	id: UserID,
	groups: [ GroupID1, GroupID2, ... ]
}

Group: {
	id: GroupID,
	users: [ UserID1, UserID2, ... ],
	name:
	...
}

To its eventual children, only GRANTED or DENIED is transmitted.
It is sufficient since the children should know the required level of authorization, so none|all|max|min is solvable.


