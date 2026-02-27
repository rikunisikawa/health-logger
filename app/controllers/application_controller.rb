class ApplicationController < ActionController::Base
  allow_browser versions: :modern
  stale_when_importmap_changes

  private

  def http_authenticate!
    username = ENV.fetch("AUTH_USERNAME", "admin")
    password = ENV.fetch("AUTH_PASSWORD") { raise "AUTH_PASSWORD must be set" }

    authenticate_or_request_with_http_basic("Health Logger") do |u, p|
      # タイミング攻撃を防ぐため ActiveSupport::SecurityUtils を使用
      valid_u = ActiveSupport::SecurityUtils.secure_compare(u, username)
      valid_p = ActiveSupport::SecurityUtils.secure_compare(p, password)
      if valid_u && valid_p
        session[:user_id] = Digest::SHA256.hexdigest(username)[0, 16]
        true
      else
        false
      end
    end
  end
end
