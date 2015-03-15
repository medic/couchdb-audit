var log = require('./log');

module.exports = {

  /**
   * Initialise the audit logger.
   *
   * @name withFelix(felix, name)
   * @param {Object} felix The felix instance to use to persist.
   * @param {String|Function(err, name)} name Either the authors name, 
   *    or a function to retrieve the name.
   * @api public
   */
  withFelix: function(felix, name) {
    var nameFn = (typeof name === 'string') ? 
      function(callback) { callback(null, name); } : name;
    return log.init(felix.name, felix.client, felix, nameFn);
  }

};

/**
 * @deprecated Use withFelix instead.
 */
module.exports.withNode = module.exports.withFelix;