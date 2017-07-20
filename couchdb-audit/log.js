var async = require('async');

module.exports = {
  /**
   * Initialise the audit logger.
   *
   * @name init(appname, db, name)
   * @param {String} appname The name of the app.
   * @param {Object} docsDb The db instance to use to persist standard documents.
   * @param {Object} auditDb The db instance to use to persist audit documents.
   *                 This can be the same as `docsDb`
   * @param {Function(err, name)} name Returns the username.
   * @api public
   */
  init: function(appname, client, docsDb, auditDb, nameFn) {

    function audit(docs, actionOverride, callback) {
      if (!callback) {
        callback = actionOverride;
        actionOverride = undefined;
      }

      nameFn(function(err, userName) {
        if (err) {
          return callback(err);
        }

        getAllRecords(docs, function(err, _records) {
          if (err) {
            return callback(err);
          }
          var auditDoc;
          async.map(docs, function(_doc, _cb) {
            if (!_doc._id) {
              client.uuids(1, function(err, ids) {
                if (err) {
                  return _cb(err);
                }
                _doc._id = ids.uuids[0];
                auditDoc = createAudit(_doc);
                appendHistory(auditDoc.history, 'create', userName, _doc);
                _cb(null, auditDoc);
              });
            } else {
              var record = findRecord(_doc, _records);
              if (!record) {
                auditDoc = createAudit(_doc);
                if (_doc._rev && !isInitialRev(_doc)) {
                  // no existing audit, but existing revision - log current
                  docsDb.getDoc(_doc._id, function(err, _oldDoc) {
                    if (err) {
                      // can't get existing doc, or doesn't exist. save audit anyway.
                      appendHistory(auditDoc.history, 'create', userName, _doc);
                    } else {
                      var action = isInitialRev(_oldDoc) ? 'create' : 'update';
                      appendHistory(auditDoc.history, action, null, _oldDoc);
                      action = actionOverride || _doc._deleted ? 'delete' : 'update';
                      appendHistory(auditDoc.history, action, userName, _doc);
                    }
                    _cb(null, auditDoc);
                  });
                } else {
                  // no existing audit or existing revision
                  appendHistory(auditDoc.history, 'create', userName, _doc);
                  _cb(null, auditDoc);
                }
              } else {
                // existing audit
                auditDoc = record.doc;
                var action = actionOverride || _doc._deleted ? 'delete' : 'update';
                appendHistory(auditDoc.history, action, userName, _doc);
                _cb(null, auditDoc);
              }
            }
          }, function(err, auditRecords) {
            if (err) {
              return callback(err);
            }
            bulkDocs(auditRecords, callback);
            // auditDb.bulkDocs({docs: auditRecords}, callback);
          });
        });
      });
    }

    function findRecord(doc, records) {
      var auditId = getAuditId(doc._id);
      for (var i = 0; i < records.length; i++) {
        if (records[i].id === auditId) {
          return records[i];
        }
      }
    }

    function getAllRecords(docs, callback) {
      var ids = [];
      docs.forEach(function(_doc) {
        if (_doc._id) {
          ids.push(getAuditId(_doc._id));
        }
      });
      if (!ids.length) {
        return callback(null, []);
      }
      getAll(ids, callback);
    }

    function clone(obj) {
      var result = {};
      for (var attr in obj) {
          if (obj.hasOwnProperty(attr)) result[attr] = obj[attr];
      }
      return result;
    }

    function isInitialRev(doc) {
      return doc._rev.indexOf('1-') === 0;
    }

    function createAudit(record) {
      return {
        _id: getAuditId(record._id),
        type: 'audit_record',
        history: []
      };
    }

    function appendHistory(history, action, user, doc) {
      if (history.length > 0) {
        history[history.length - 1].doc._rev = doc._rev;
      }
      doc = clone(doc);
      doc._rev = 'current';
      history.push({
        action: action,
        user: user,
        timestamp: new Date().toISOString(),
        doc: doc
      });
    }

    function get(docId, callback) {
      getAll([getAuditId(docId)], function(err, result) {
        callback(err, result && result.length && result[0]);
      });
    }

    var MULTI_DOC_BATCH = 100;
    function batch(items, initial, action, collect, callback) {
      var partitioned = [];
      while (items.length > 0) {
        partitioned.push(items.splice(0, MULTI_DOC_BATCH));
      }

      async.reduce(partitioned, initial, function(memo, item, cb) {
        action(item, function(err, results) {
          if (err) {
            cb(err);
          } else {
            cb(null, collect(memo, results));
          }
        });
      }, callback);
    }
    function getAll(docIds, callback) {
      batch(docIds, [],
        function(docIds, cb) {
          auditDb.allDocs({ include_docs: true, keys: docIds }, cb);
        },
        function(memo, results) {
          memo = memo.concat(results.rows);
          return memo;
        },
        callback);
    }
    function bulkDocs(docs, callback) {
      batch(docs, [],
        function(docs, cb) {
          auditDb.bulkDocs({docs: docs}, cb);
        },
        function(memo, results) {
          return memo.concat(results);
        }, callback);
    }

    function getAuditId(docId) {
      return docId + '-audit';
    }

    return {

      /**
       * Saves the given doc with an audit record
       *
       * @name saveDoc(doc, callback)
       * @param {Object} doc
       * @param {Function} callback(err,response)
       * @api public
       */
      saveDoc: function(doc, callback) {
        audit([doc], function(err) {
          if (err) {
            return callback(err);
          }
          docsDb.saveDoc(doc, callback);
        });
      },

      /**
       * Saves the given docs with individual audit records
       *
       * @name bulkSave(docs, options, callback)
       * @param {Array} docs An array of documents to be saved
       * @param {Object} options Optional options to pass through to bulk save
       * @param {Function} callback(err,response)
       * @api public
       */
      bulkSave: function(docs, options, callback) {
        if (!callback) {
          callback = options;
          options = {};
        }
        audit(docs, function(err) {
          if (err) {
            return callback(err);
          }
          options.docs = docs;
          docsDb.bulkDocs(options, callback);
        });
      },

      /**
       * Deletes the given doc with auditing
       *
       * @name removeDoc(doc, callback)
       * @param {Object} doc
       * @param {Function} callback(err,response)
       * @api public
       */
      removeDoc: function(doc, callback) {
        audit([doc], 'delete', function(err) {
          if (err) {
            return callback(err);
          }
          docsDb.removeDoc(doc._id, doc._rev, callback);
        });
      },

      /**
       * Get the audit_record for the given docId
       *
       * @name get(docId, callback)
       * @param {String} docId The id of the `data_record` document
       * @param {Function} callback(err,response)
       * @api public
       */
      get: get,

      /**
       * Save the audit record only
       *
       * @name log(docs, callback)
       * @param {Array} docs An array of documents to be saved
       * @param {Function} callback(err,response)
       * @api public
       */
      log: audit

    };
  }
};
