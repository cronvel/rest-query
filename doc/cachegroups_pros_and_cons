


With cache
==========

User: {
	id: UserID,
	cachedGroups: [ GroupID1, GroupID2, ... ]
}

Group: {
	id: GroupID,
	users: [ UserID1, UserID2, ... ],
	name:
	...
}

Pros:
* Faster: checking access never need an extra request for groups

Cons:
* The restQuery security model should have a workaround: write access granted to a resource should not grant write access
to the 'cachedGroups' property

* Each change on a group should alter related user

* Can generate bugs if the cache is desync



Without cache
=============

User: {
	id: UserID
}

Group: {
	id: GroupID,
	users: [ UserID1, UserID2, ... ],
	name:
	...
}

Pros:
* The restQuery security model works without any patch or workaround: write access granted to a resource has no exception.

Cons:
* An additional request should be made when a resource has some groups that can validate current access.

db.groups.find( { _id: { $in: [ groupId1, groupId2, ... ] } , users: { $in: [ userId1 ] } } )


