#!/bin/sh

rm -rf dist && \
mkdir -p dist/reporter && \
mkdir -p dist/graph && \

cp -r packages/reporter/dist/* dist/reporter/ && \
cp -r packages/graph/dist/* dist/graph/