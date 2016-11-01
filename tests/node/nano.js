var sinon = require('sinon'),
  user = 'someuser';

exports['bulkSave works with nano couchdb node module'] = function(test) {
  test.expect(18);

  var name = 'testAppName';
  var docsDbName = 'docsDbName';
  var auditDbName = 'auditDbName';
  var docId1 = 123;
  var docId2 = 456;
  var auditId1 = docId1 + '-audit';
  var auditId2 = docId2 + '-audit';
  var doc1 = {
    _id: docId1,
    type: 'data_record',
    foo: 'baz'
  };
  var doc2 = {
    _id: docId2,
    type: 'data_record',
    foo: 'bar'
  };

  var dbs = {
    auditDbName: {
      bulk: function(options, callback) {
        callback(null);
      },
      list: function(query, callback) {
        test.deepEqual(query.keys, [ auditId1, auditId2 ]);
        callback(null, {rows:[{
          id: auditId1,
          doc: {
            _id: auditId1,
            type: 'audit_record',
            history: [{ action: 'create', doc: doc1 }]
          }
        }, {
          id: auditId2,
          doc: {
            _id: auditId2,
            type: 'audit_record',
            history: [{ action: 'create', doc: doc2 }]
          }
        }]});
      }
    },
    docsDbName: {
      bulk: function(options, callback) {
        callback(null);
      }
    }
  };

  var nano = {
    use: function(name) {
      return dbs[name];
    }
  };
  var saveDocs = sinon.spy(dbs[docsDbName], 'bulk');
  var saveAuditDocs = sinon.spy(dbs[auditDbName], 'bulk');
  var list = sinon.spy(dbs[auditDbName], 'list');
  var audit = require('../../couchdb-audit/node').withNano(nano, docsDbName, auditDbName, name, user);

  audit.bulkSave([doc1, doc2], {all_or_nothing: true}, function(err, result) {
    test.equal(err, null);
  });

  test.equal(list.callCount, 1);
  test.equal(saveDocs.callCount, 1);
  test.equal(saveAuditDocs.callCount, 1);
  var auditRecord = saveAuditDocs.firstCall.args[0].docs;

  auditRecord.forEach(function(record) {
    test.equal(record.type, 'audit_record');
    test.equal(record.history.length, 2);
    test.equal(record.history[1].action, 'update');
    test.equal(record.history[1].user, user);
    if (record._id === auditId1) {
      test.equal(record.history[0].doc, doc1);
    } else if (record._id === auditId2) {
      test.equal(record.history[0].doc, doc2);
    } else {
      test.ok(false, 'Unexpected _id');
    }
  });

  test.equal(saveDocs.firstCall.args[0].all_or_nothing, true);
  var dataRecords = saveDocs.firstCall.args[0].docs;
  test.equal(dataRecords[0], doc1);
  test.equal(dataRecords[1], doc2);
  test.done();
};


exports['saving a new `data_record` creates a new `audit_record`'] = function(test) {
  test.expect(15);

  var docId = 123;
  var auditId = docId + '-audit';
  var doc1 = {
    _id: undefined,
    _rev: undefined,
    type: 'data_record'
  };

  var db = {
    insert: function(doc, callback) {
      callback(null, {id: docId});
    },
    bulk: function(options, callback) {
      callback(null);
    }
  };
  var nano = {
    use: function() {
      return db;
    },
    request: function(options, callback) {
      callback(null, {uuids: [docId]});
    }
  };
  var saveDoc = sinon.spy(db, 'insert');
  var bulkSave = sinon.spy(db, 'bulk');
  var newUUID = sinon.spy(nano, 'request');
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);

  audit.saveDoc(doc1, function(err, result) {
    test.equal(err, null);
    test.equal(result.id, docId);
  });

  test.equal(bulkSave.callCount, 1);
  test.equal(saveDoc.callCount, 1);
  test.equal(newUUID.callCount, 1);
  var auditRecord = bulkSave.firstCall.args[0].docs[0];
  var dataRecord = saveDoc.firstCall.args[0];
  test.equal(auditRecord.type, 'audit_record');
  test.equal(auditRecord._id, auditId);
  test.equal(auditRecord.history.length, 1);
  test.equal(auditRecord.history[0].action, 'create');
  test.equal(auditRecord.history[0].user, user);
  test.ok(!!auditRecord.history[0].timestamp);
  test.equal(auditRecord.history[0].doc._id, docId);
  test.equal(auditRecord.history[0].doc._rev, 'current'); // we don't know the rev yet
  test.equal(dataRecord.type, 'data_record');
  test.equal(dataRecord._id, docId);
  test.done();

};

exports['when list fails, doc is not saved and error returned'] = function(test) {
  test.expect(1);

  var errMsg = 'ERR1';
  var doc1 = {
    _id: '251849',
    type: 'data_record'
  };

  var db = {
    list: function(query, callback) {
      callback(errMsg);
    }
  };
  var nano = {
    use: function() {
      return db;
    }
  };
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);
  audit.saveDoc(doc1, function(err, result) {
    test.equal(err, errMsg);
  });

  test.done();
};

exports['saving a new `data_record` with id set creates a new `audit_record`'] = function(test) {
  test.expect(14);

  var docId = '251849';
  var auditId = docId + '-audit';

  var doc1 = {
    _id: docId,
    _rev: undefined,
    type: 'data_record'
  };

  var db = {
    insert: function(doc, callback) {
      callback(null, {id: docId});
    },
    bulk: function(options, callback) {
      callback(null);
    },
    list: function(query, callback) {
      callback(null, {'rows':[]});
    }
  };
  var nano = {
    use: function() {
      return db;
    }
  };
  var saveDoc = sinon.spy(db, 'insert');
  var bulkSave = sinon.spy(db, 'bulk');
  var list = sinon.spy(db, 'list');
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);

  audit.saveDoc(doc1, function(err, result) {
    test.equal(err, null);
    test.equal(result.id, docId);
  });

  test.equal(bulkSave.callCount, 1);
  test.equal(saveDoc.callCount, 1);
  test.equal(list.callCount, 1);
  var auditRecord = bulkSave.firstCall.args[0].docs[0];
  var dataRecord = saveDoc.firstCall.args[0];
  test.equal(auditRecord.type, 'audit_record');
  test.equal(auditRecord._id, auditId);
  test.equal(auditRecord.history.length, 1);
  test.equal(auditRecord.history[0].action, 'create');
  test.equal(auditRecord.history[0].user, user);
  test.equal(auditRecord.history[0].doc._id, docId);
  test.equal(auditRecord.history[0].doc._rev, 'current'); // we don't know the rev yet
  test.equal(dataRecord.type, 'data_record');
  test.equal(dataRecord._id, docId);
  test.done();
};

exports['updating a `data_record` updates the `audit_record`'] = function(test) {
  test.expect(18);

  var docId = 123;
  var auditId = docId + '-audit';

  var rev1 = '1-ASD';
  var doc1 = {
    _id: docId,
    type: 'data_record',
    foo: 'baz'
  };
  var doc2 = {
    _id: docId,
    _rev: rev1,
    type: 'data_record',
    foo: 'bar'
  };

  var db = {
    insert: function(doc, callback) {
      callback(null, {id: docId});
    },
    bulk: function(options, callback) {
      callback(null);
    },
    list: function(query, callback) {
      test.deepEqual(query.keys, [ auditId ]);
      callback(null, {"rows":[{
        id: auditId,
        doc: {
          type: 'audit_record',
          _id: auditId,
          history: [{ action: 'create', user: user, doc: doc1 }]
        }
      }]});
    }
  };
  var nano = {
    use: function() {
      return db;
    }
  };
  var saveDoc = sinon.spy(db, 'insert');
  var bulkSave = sinon.spy(db, 'bulk');
  var list = sinon.spy(db, 'list');
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);

  audit.saveDoc(doc2, function(err, result) {
    test.equal(err, null);
    test.equal(result.id, docId);
  });

  test.equal(list.callCount, 1);
  test.equal(saveDoc.callCount, 1);
  test.equal(bulkSave.callCount, 1);
  var auditRecord = bulkSave.firstCall.args[0].docs[0];
  var dataRecord = saveDoc.firstCall.args[0];
  test.equal(auditRecord.type, 'audit_record');
  test.equal(auditRecord._id, auditId);
  test.equal(auditRecord.history.length, 2);
  test.equal(auditRecord.history[0].action, 'create');
  test.equal(auditRecord.history[0].user, user);
  test.equal(auditRecord.history[0].doc.foo, 'baz');
  test.equal(auditRecord.history[0].doc._rev, rev1);
  test.equal(auditRecord.history[1].action, 'update');
  test.equal(auditRecord.history[1].user, user);
  test.equal(auditRecord.history[1].doc.foo, 'bar');
  test.equal(auditRecord.history[1].doc._rev, 'current');
  test.equal(dataRecord._rev, rev1);
  test.done();
};

exports['deleting a `data_record` updates the `audit_record`'] = function(test) {
  test.expect(16);

  var docId = 123;
  var auditId = docId + '-audit';

  var doc1 = {
    _id: docId,
    type: 'data_record'
  };
  var doc2 = {
    _id: docId,
    type: 'data_record',
    _deleted: true
  };

  var db = {
    insert: function(doc, callback) {
      callback(null, {id: docId});
    },
    bulk: function(options, callback) {
      callback(null);
    },
    list: function(query, callback) {
      test.deepEqual(query.keys, [ auditId ]);
      callback(null, {"rows":[{
        id: auditId,
        doc: {
          _id: auditId,
          type: 'audit_record',
          history: [{ action: 'create', user: user, doc: doc1 }]
        }
      }]});
    }
  };
  var nano = {
    use: function() {
      return db;
    }
  };
  var saveDoc = sinon.spy(db, 'insert');
  var bulkSave = sinon.spy(db, 'bulk');
  var list = sinon.spy(db, 'list');
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);

  audit.saveDoc(doc2, function(err, result) {
    test.equal(err, null);
    test.equal(result.id, docId);
  });

  test.equal(list.callCount, 1);
  test.equal(saveDoc.callCount, 1);
  test.equal(bulkSave.callCount, 1);
  var auditRecord = bulkSave.firstCall.args[0].docs[0];
  var dataRecord = saveDoc.firstCall.args[0];
  test.equal(auditRecord.type, 'audit_record');
  test.equal(auditRecord._id, auditId);
  test.equal(auditRecord.history.length, 2);
  test.equal(auditRecord.history[0].action, 'create');
  test.equal(auditRecord.history[0].user, user);
  test.equal(auditRecord.history[0].doc, doc1);
  test.equal(auditRecord.history[1].action, 'delete');
  test.equal(auditRecord.history[1].user, user);
  test.equal(auditRecord.history[1].doc._deleted, true);
  test.equal(dataRecord, doc2);
  test.done();
};

exports['updating a `data_record` creates an `audit_record` if required'] = function(test) {
  test.expect(13);

  var docId = 123;
  var auditId = docId + '-audit';

  var doc1 = {
    _id: docId,
    _rev: '1-XXXXXXX',
    type: 'data_record'
  };
  var doc2 = {
    _id: docId,
    _rev: '2-XXXXXXX',
    type: 'data_record',
    foo: 'bar'
  };

  var db = {
    insert: function(doc, callback) {
      callback(null, {id: docId});
    },
    bulk: function(options, callback) {
      callback(null);
    },
    list: function(query, callback) {
      callback(null, {'rows':[]});
    },
    get: function(id, callback) {
      callback(null, doc1);
    }
  };
  var nano = {
    use: function() {
      return db;
    }
  };
  var saveDoc = sinon.spy(db, 'insert');
  var bulkSave = sinon.spy(db, 'bulk');
  var list = sinon.spy(db, 'list');
  var getDoc = sinon.spy(db, 'get');
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);

  audit.saveDoc(doc2, function(err, result) {
    test.equal(err, null);
    test.equal(result.id, docId);
  });

  test.equal(list.callCount, 1);
  test.equal(saveDoc.callCount, 1);
  test.equal(getDoc.callCount, 1);
  var auditRecord = bulkSave.firstCall.args[0].docs[0];
  var dataRecord = saveDoc.firstCall.args[0];
  test.equal(auditRecord.type, 'audit_record');
  test.equal(auditRecord._id, auditId);
  test.equal(auditRecord.history.length, 2);
  test.equal(auditRecord.history[0].action, 'create');
  test.equal(auditRecord.history[0].doc._rev, '2-XXXXXXX');
  test.equal(auditRecord.history[1].action, 'update');
  test.equal(auditRecord.history[1].doc._rev, 'current');
  test.equal(dataRecord, doc2);
  test.done();
};

exports['updating a `data_record` creates an `audit_record` if required and handles missing doc'] = function(test) {
  test.expect(11);

  var docId = 123;
  var auditId = docId + '-audit';

  var doc1 = {
    _id: docId,
    _rev: '1-XXXXXXX',
    type: 'data_record'
  };
  var doc2 = {
    _id: docId,
    _rev: '2-XXXXXXX',
    type: 'data_record',
    foo: 'bar'
  };

  var db = {
    insert: function(doc, callback) {
      callback(null, {id: docId});
    },
    bulk: function(options, callback) {
      callback(null);
    },
    list: function(query, callback) {
      callback(null, {'rows':[]});
    },
    get: function(id, callback) {
      callback(new Error('no existing doc'));
    }
  };
  var nano = {
    use: function() {
      return db;
    }
  };
  var saveDoc = sinon.spy(db, 'insert');
  var bulkSave = sinon.spy(db, 'bulk');
  var list = sinon.spy(db, 'list');
  var getDoc = sinon.spy(db, 'get');
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);

  audit.saveDoc(doc2, function(err, result) {
    test.equal(err, null);
    test.equal(result.id, docId);
  });

  test.equal(list.callCount, 1);
  test.equal(saveDoc.callCount, 1);
  test.equal(getDoc.callCount, 1);
  var auditRecord = bulkSave.firstCall.args[0].docs[0];
  var dataRecord = saveDoc.firstCall.args[0];
  test.equal(auditRecord.type, 'audit_record');
  test.equal(auditRecord._id, auditId);
  test.equal(auditRecord.history.length, 1);
  test.equal(auditRecord.history[0].action, 'create');
  test.equal(auditRecord.history[0].doc._rev, 'current');
  test.equal(dataRecord, doc2);
  test.done();
};

exports['bulkSave updates all relevant `audit_record` docs'] = function(test) {
  test.expect(14);

  var docId1 = 123;
  var docId2 = 456;
  var auditId1 = docId1 + '-audit';
  var auditId2 = docId2 + '-audit';

  var doc1 = {
    _id: docId1,
    type: 'data_record',
    foo: 'baz'
  };
  var doc2 = {
    _id: docId2,
    type: 'data_record',
    foo: 'bar'
  };

  var db = {
    bulk: function(options, callback) {
      callback(null);
    },
    list: function(query, callback) {
      test.deepEqual(query.keys, [ auditId1, auditId2 ]);
      callback(null, {"rows":[{
        id: auditId1,
        doc: {
          _id: auditId1,
          type: 'audit_record',
          history: [{ action: 'create', doc: doc1 }]
        }
      }, {
        id: auditId2,
        doc: {
          _id: auditId2,
          type: 'audit_record',
          history: [{ action: 'create', doc: doc2 }]
        }
      }]});
    }
  };
  var nano = {
    use: function() {
      return db;
    }
  };
  var save = sinon.spy(db, 'bulk');
  var list = sinon.spy(db, 'list');
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);

  audit.bulkSave([doc1, doc2], {all_or_nothing: true}, function(err, result) {
    test.equal(err, null);
  });

  test.equal(list.callCount, 1);
  test.equal(save.callCount, 2);
  var auditRecord = save.firstCall.args[0].docs;
  var dataRecord = save.secondCall.args[0].docs;
  auditRecord.forEach(function(record) {
    test.equal(record.type, 'audit_record');
    test.equal(record.history.length, 2);
    test.equal(record.history[1].action, 'update');
    if (record._id === auditId1) {
      test.equal(record.history[0].doc, doc1);
    } else if (record._id === auditId2) {
      test.equal(record.history[0].doc, doc2);
    } else {
      test.ok(false, 'Unexpected _id');
    }
  });
  test.equal(dataRecord[0], doc1);
  test.equal(dataRecord[1], doc2);
  test.done();
};

exports['bulkSave creates `audit_record` docs when needed'] = function(test) {
  test.expect(25);

  var docId1 = 123;
  var docId2 = 456;
  var docId3 = 789;
  var auditId1 = docId1 + '-audit';
  var auditId2 = docId2 + '-audit';
  var auditId3 = docId3 + '-audit';

  // doc with no audit record
  var doc1 = {
    _id: docId1,
    _rev: '2-XXXXXXX',
    type: 'data_record',
    foo: 'baz'
  };
  // new doc
  var doc2 = {
    type: 'data_record',
    foo: 'bar'
  };
  // deleted doc
  var doc3 = {
    _id: docId3,
    _rev: '3-XXXXXXX',
    type: 'data_record',
    foo: 'bar',
    _deleted: true
  };

  var db = {
    bulk: function(options, callback) {
      callback(null);
    },
    list: function(query, callback) {
      callback(null, {'rows':[ ]});
    },
    get: function(id, callback) {
      callback(null, doc1);
    }
  };
  var nano = {
    use: function() {
      return db;
    },
    request: function(options, callback) {
      callback(null, {uuids: [docId2]});
    }
  };
  var save = sinon.spy(db, 'bulk');
  var list = sinon.spy(db, 'list');
  var newUUID = sinon.spy(nano, 'request');
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);

  audit.bulkSave([doc1, doc2, doc3], function(err, result) {
    test.equal(err, null);
  });

  test.equal(list.callCount, 1);
  test.equal(save.callCount, 2);
  test.equal(newUUID.callCount, 1);
  var auditRecord = save.firstCall.args[0].docs;
  var dataRecord = save.secondCall.args[0].docs;
  test.equal(auditRecord.length, 3);
  auditRecord.forEach(function(record) {
    test.equal(record.type, 'audit_record');
    if (record._id === auditId1) {
      test.equal(record.history.length, 2);
      test.equal(record.history[0].action, 'update');
      test.equal(record.history[0].doc._id, docId1);
      test.equal(record.history[1].action, 'update');
      test.equal(record.history[1].doc._id, docId1);
    } else if (record._id === auditId2) {
      test.equal(record.history.length, 1);
      test.equal(record.history[0].action, 'create');
      test.equal(record.history[0].doc._id, docId2);
    } else if (record._id === auditId3) {
      test.equal(record.history.length, 2);
      test.equal(record.history[0].action, 'update');
      test.equal(record.history[0].doc._id, docId1);
      test.equal(record.history[1].action, 'delete');
      test.equal(record.history[1].doc._id, docId3);
    } else {
      test.ok(false, 'Unexpected _id');
    }
  });
  test.equal(dataRecord.length, 3);
  test.equal(dataRecord[0], doc1);
  test.equal(dataRecord[1], doc2);
  test.equal(dataRecord[2], doc3);
  test.done();
};

exports['when audit fails, doc is not saved and error returned'] = function(test) {
  test.expect(2);

  var errMsg = 'ERR1';
  var docId = 123;
  var doc1 = {
    _id: undefined,
    type: 'data_record'
  };

  var db = {
    bulk: function(options, callback) {
      callback(errMsg);
    }
  };
  var nano = {
    use: function() {
      return db;
    },
    request: function(options, callback) {
      callback(null, {uuids: [docId]});
    }
  };
  var bulkSave = sinon.spy(db, 'bulk');
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);
  audit.saveDoc(doc1, function(err, result) {
    test.equal(err, errMsg);
  });

  test.equal(bulkSave.callCount, 1);
  test.done();
};

exports['get returns the `audit_record` for the given `data_record`'] = function(test) {
  test.expect(2);

  var docId = 123;
  var expected = {
    doc: {
      _id: docId
    }
  };

  var db = {
    list: function(query, callback) {
      callback(null, {'rows':[ expected ]});
    }
  };
  var nano = {
    use: function() {
      return db;
    }
  };
  sinon.spy(db, 'list');
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);
  audit.get(docId, function(err, result) {
    test.equal(err, null);
    test.equal(result, expected);
  });

  test.done();
};

exports['removeDoc updates the `audit_record` for the given `data_record`'] = function(test) {
  test.expect(14);

  var docId = 123;
  var auditId = docId + '-audit';
  var doc1 = {
    _id: docId,
    _rev: '1-XXXXXXX',
    type: 'data_record'
  };

  var db = {
    list: function(query, callback) {
      test.deepEqual(query.keys, [ auditId ]);
      callback(null, {"rows":[{
        id: auditId,
        doc: {
          _id: auditId,
          type: 'audit_record',
          history: [{ action: 'create', user: user, doc: doc1 }]
        }
      }]});
    },
    bulk: function(options, callback) {
      callback(null);
    },
    destroy: function(db, options, callback) {
      callback(null);
    }
  };
  var nano = {
    use: function() {
      return db;
    }
  };
  var removeDoc = sinon.spy(db, 'destroy');
  var bulkSave = sinon.spy(db, 'bulk');
  var audit = require('../../couchdb-audit/node').withNano(nano, 'medic', 'medic', 'test', user);

  audit.removeDoc(doc1, function(err) {
    test.equal(err, null);
  });

  test.equal(bulkSave.callCount, 1);
  test.equal(removeDoc.callCount, 1);
  var auditRecord = bulkSave.firstCall.args[0].docs[0];
  var dataRecord = removeDoc.firstCall.args[0];
  test.equal(auditRecord.type, 'audit_record');
  test.equal(auditRecord._id, auditId);
  test.equal(auditRecord.history.length, 2);
  test.equal(auditRecord.history[0].action, 'create');
  test.equal(auditRecord.history[0].user, user);
  test.equal(auditRecord.history[0].doc._id, docId);
  test.equal(auditRecord.history[1].action, 'delete');
  test.equal(auditRecord.history[1].user, user);
  test.equal(auditRecord.history[1].doc._id, docId);
  test.equal(dataRecord, docId);
  test.done();
};
