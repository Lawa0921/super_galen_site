source "https://rubygems.org"

# Ruby 版本（相容 Vercel 和本地環境）
ruby ">= 3.2.0"

# Jekyll 核心
gem "jekyll", "~> 4.3"

# Ruby 3.5+ 相容性（避免 logger gem 警告）
gem "logger"

# 注意：已移除 minima 主題，專案使用自訂樣式 (assets/css/main.scss)

# Jekyll 插件
group :jekyll_plugins do
  gem "jekyll-feed", "~> 0.12"
  gem "jekyll-seo-tag", "~> 2.8"
  gem "jekyll-sitemap", "~> 1.4"
  gem "jekyll-paginate", "~> 1.1"
end

# 平台特定依賴（Windows）
gem "tzinfo-data", platforms: [:windows, :jruby]
gem "wdm", "~> 0.1.1", platforms: [:windows, :jruby]

# 開發工具
group :development do
  gem "foreman", "~> 0.87"
end
