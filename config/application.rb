require_relative "boot"

require "rails"
require "active_model/railtie"
require "active_job/railtie"
# ActiveRecord不使用 (データはS3に直接書き込み)
# require "active_record/railtie"
# require "active_storage/engine"
require "action_controller/railtie"
require "action_mailer/railtie"
require "action_view/railtie"
require "action_cable/engine"

Bundler.require(*Rails.groups)

module App
  class Application < Rails::Application
    config.load_defaults 8.1

    config.autoload_lib(ignore: %w[assets tasks])

    config.generators.system_tests = nil

    # セッションはcookieベース (DBなし)
    config.session_store :cookie_store, key: "_health_logger_session"
  end
end
