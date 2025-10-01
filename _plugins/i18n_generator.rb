# frozen_string_literal: true

# _plugins/i18n_generator.rb
# 將模組化的 YAML 翻譯檔案合併並轉換為 JSON 供 JavaScript 使用

require 'json'
require 'yaml'
require 'fileutils'

module Jekyll
  # I18nGenerator - 自動合併模組化 i18n YAML 檔案並生成 JSON
  # 支援模組化翻譯檔案結構，也相容傳統單一 YAML 檔案模式
  class I18nGenerator < Generator
    safe true
    priority :highest

    def generate(site)
      Jekyll.logger.info "I18n:", "開始處理模組化 i18n 檔案..."

      # 取得所有語言
      languages = site.config['languages'] || ['zh-TW']

      # 建立 assets/i18n 目錄
      i18n_dir = File.join(site.source, 'assets', 'i18n')
      FileUtils.mkdir_p(i18n_dir) unless Dir.exist?(i18n_dir)

      # 對每個語言處理模組化檔案
      languages.each do |lang|
        # 檢查是否有模組化目錄
        lang_module_dir = File.join(site.source, '_data', 'i18n', lang)

        if Dir.exist?(lang_module_dir)
          # 模組化模式：合併所有模組檔案
          Jekyll.logger.info "I18n:", "合併 #{lang} 模組..."
          merged_data = merge_modules(lang_module_dir)

          # 將合併後的資料存入 site.data
          site.data['i18n'] ||= {}
          site.data['i18n'][lang] = merged_data

          # 生成 JSON
          json_file = File.join(i18n_dir, "#{lang}.json")
          File.write(json_file, JSON.pretty_generate(merged_data))

          # 將 JSON 檔案加入 Jekyll 的靜態檔案列表
          site.static_files << Jekyll::StaticFile.new(
            site,
            site.source,
            'assets/i18n',
            "#{lang}.json"
          )

          Jekyll.logger.info "I18n:", "✓ #{lang}.json (#{merged_data.keys.size} 個模組)"
        else
          # 傳統模式：直接讀取單一 YAML 檔案
          yaml_file = File.join(site.source, '_data', 'i18n', "#{lang}.yml")

          if File.exist?(yaml_file)
            data = YAML.load_file(yaml_file)

            json_file = File.join(i18n_dir, "#{lang}.json")
            File.write(json_file, JSON.pretty_generate(data))

            site.static_files << Jekyll::StaticFile.new(
              site,
              site.source,
              'assets/i18n',
              "#{lang}.json"
            )

            Jekyll.logger.info "I18n:", "Generated #{lang}.json (傳統模式)"
          else
            Jekyll.logger.warn "I18n:", "Missing translation files for #{lang}"
          end
        end
      end

      Jekyll.logger.info "I18n:", "✓ i18n 處理完成"
    end

    private

    # 深度合併 Hash
    def deep_merge!(target, source)
      source.each do |key, value|
        if target[key].is_a?(Hash) && value.is_a?(Hash)
          deep_merge!(target[key], value)
        else
          target[key] = value
        end
      end
      target
    end

    # 合併模組檔案
    def merge_modules(module_dir)
      merged_data = {}
      module_files = Dir.glob(File.join(module_dir, '*.yml')).sort

      module_files.each do |module_file|
        module_name = File.basename(module_file, '.yml')

        begin
          module_data = YAML.load_file(module_file)
          deep_merge!(merged_data, module_data) if module_data.is_a?(Hash)
          Jekyll.logger.debug "I18n:", "  ✓ #{module_name}"
        rescue StandardError => e
          Jekyll.logger.error "I18n:", "  ✗ #{module_name}: #{e.message}"
        end
      end

      merged_data
    end
  end
end