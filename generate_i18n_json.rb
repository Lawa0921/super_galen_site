#!/usr/bin/env ruby
# frozen_string_literal: true

# 手動生成 i18n JSON 檔案
# 用於開發時快速更新翻譯檔案,無需重新啟動 Jekyll

require 'json'
require 'yaml'
require 'fileutils'

languages = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko']

# 建立 assets/i18n 目錄
i18n_dir = 'assets/i18n'
FileUtils.mkdir_p(i18n_dir) unless Dir.exist?(i18n_dir)

# 對每個語言生成 JSON 檔案
languages.each do |lang|
  yaml_file = "_data/i18n/#{lang}.yml"
  json_file = "#{i18n_dir}/#{lang}.json"

  if File.exist?(yaml_file)
    # 讀取 YAML，允許 Date 類別
    data = YAML.safe_load_file(yaml_file, permitted_classes: [Date])

    # 寫入 JSON
    File.write(json_file, JSON.pretty_generate(data))

    puts "Generated #{json_file}"
  else
    puts "Missing translation file for #{lang}"
  end
end