var log = require('./log');

var getNameFn = function(name) {
  return (typeof name === 'string') ?
    function(callback) { callback(null, name); } : name;
};

module.exports = {

  /**
   * Initialise the audit logger for felix-couchdb.
   * https://www.npmjs.com/package/felix-couchdb
   *
   * @name withFelix(felix, name)
   * @param {Object} felix The felix instance to use to persist.
   * @param {String|Function(err, name)} name Either the authors name,
   *    or a function to retrieve the name.
   * @api public
   */
  withFelix: function(felix, name) {
    // FIXME: support a different audit and docs db
    return log.init(felix.name, felix.client, felix, felix, getNameFn(name));
  },

  /**
   * Initialise the audit logger for nano.
   * https://www.npmjs.com/package/nano
   *
   * @name withNano(nano, name)
   * @param {Object} nano The nano instance to use to persist.
   * @param {String} dbName The name of the db to use.
   * @param {String} designName The name of the design to use.
   * @param {String|Function(err, name)} authorName Either the authors name,
   *    or a function to retrieve the name.
   * @api public
   */
  // withNano: function(nano, dbName, designName, authorName) {
  withNano: function(nano, dbName, auditDbName, designName, authorName) {
    // let calls fall through- only overwrite calls that need to be audited
    var db = nano.use(dbName);
    var dbWrapper = {
      view: db.view,
      getDoc: db.get,
      saveDoc: db.insert,
      removeDoc: db.destroy,
      bulkDocs: db.bulk
    };

    var auditDb = nano.use(auditDbName);
    var auditDbWrapper = {
      view: auditDb.view,
      getDoc: auditDb.get,
      saveDoc: auditDb.insert,
      removeDoc: auditDb.destroy,
      bulkDocs: auditDb.bulk
    };
    var clientWrapper = {
      uuids: function(count, callback) {
        nano.request({ db: '_uuids', params: { count: count }}, callback);
      }
    };
    return log.init(designName, clientWrapper, dbWrapper, auditDbWrapper, getNameFn(authorName));
  }

};

/**
 * @deprecated Use withFelix instead.
 */
module.exports.withNode = module.exports.withFelix;
